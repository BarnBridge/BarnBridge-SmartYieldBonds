// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./../external-interfaces/uniswap/IUniswapV2Router.sol";
import "./../external-interfaces/compound-finance/ICToken.sol";
import "./../external-interfaces/compound-finance/IComptroller.sol";

import "./../lib/math/MathUtils.sol";

import "./CompoundController.sol";
import "./../oracle/IYieldOracle.sol";
import "./../IProvider.sol";

contract CompoundProvider is IProvider {
    using SafeMath for uint256;

    // underlying token (ie. DAI)
    address public uToken; // IERC20

    // claim token (ie. cDAI)
    address public cToken;

    // compound.finance Comptroller
    address public comptroller; // IComptroller

    // deposit reward token (ie. COMP)
    address public rewardCToken; // IERC20

    // cToken.balanceOf(this) measuring only deposits by users (excludes dirrect cToken transfers to pool)
    uint256 public cTokenBalance;

    // --- COMP reward checkpoint
    // saved comptroller.compSupplyState(cToken) value @ the moment the pool harvested
    uint256 public compSupplierIndexLast;

    // cumulative balanceOf @ last harvest
    uint256 public cumulativeUnderlyingBalanceHarvestedLast;

    // when we last harvested
    uint256 public harvestedLast;
    // --- /COMP reward checkpoint

    bool public _setup;

    event Harvest(address indexed caller, uint256 underlyingGot, uint256 rewardExpected, uint256 underlyingDeposited, uint256 fees, uint256 reward);

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier accountYield {
        _accountYieldInternal();
        IYieldOracle(IController(this.controller()).oracle()).update();

        _;

        underlyingBalanceLast = this.underlyingBalance();
    }

    function setup(
        address smartYield_,
        address controller_,
        address cToken_
    )
      external
    {
        require(
          false == _setup,
          "PPC: already setup"
        );

        smartYield = smartYield_;
        controller = controller_;
        cToken = cToken_;
        uToken = ICToken(cToken_).underlying();
        comptroller = ICToken(cToken_).comptroller();
        rewardCToken = IComptroller(comptroller).getCompAddress();

        _enterMarket();

        _setup = true;
    }

  // externals

    // take underlyingAmount_ from from_
    function _takeUnderlying(address from_, uint256 underlyingAmount_)
      external override
      onlySmartYield
    {
        require(
            underlyingAmount_ <= IERC20(uToken).allowance(from_, address(this)),
            "PPC: _takeUnderlying allowance"
        );
        require(
            IERC20(uToken).transferFrom(from_, address(this), underlyingAmount_),
            "PPC: _takeUnderlying transferFrom"
        );
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_)
      external override
      onlySmartYield
      returns (bool)
    {
        return IERC20(uToken).transfer(to_, underlyingAmount_);
    }

    // deposit underlyingAmount_ with the liquidity provider adds resulting cTokens to cTokenBalance
    // on the very first call enters the compound.finance market and saves the checkpoint needed for compRewardExpected
    function _depositProvider(uint256 underlyingAmount_, uint256 takeFees_)
      external override
      onlySmartYield
    {
        _depositProviderInternal(underlyingAmount_, takeFees_);
    }

    // withdraw underlyingAmount_ from the liquidity provider, substract the lost cTokens from cTokenBalance
    function _withdrawProvider(uint256 underlyingAmount_, uint256 takeFees_)
      external override
      onlySmartYield
      accountYield
    {
        underlyingFees += takeFees_;

        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        uint256 err = ICToken(cToken).redeemUnderlying(underlyingAmount_);
        require(0 == err, "PPC: _withdrawProvider redeemUnderlying");
        cTokenBalance -= cTokensBefore - ICTokenErc20(cToken).balanceOf(address(this));
    }

    // called by anyone to convert pool's COMP -> underlying and then deposit it. caller gets HARVEST_REWARD of the harvest
    function harvest()
      external override
    {
        require(
          harvestedLast < this.currentTime(),
          "PPC: harvest later"
        );

        address caller = msg.sender;

        // this is 0 unless someone transfers underlying to the contract
        uint256 underlyingBefore = IERC20(uToken).balanceOf(address(this));

        // COMP gets on the pool when:
        // 1) pool calls comptroller.claimComp()
        // 2) anyone calls comptroller.claimComp()
        // 3) anyone transfers COMP to the pool
        // we want to yield closest to 1+2 but not 3
        uint256 rewardExpected = compRewardExpected(); // COMP

        address[] memory holders = new address[](1);
        holders[0] = address(this);
        address[] memory markets = new address[](1);
        markets[0] = cToken;

        IComptroller(comptroller).claimComp(holders, markets, false, true);

        _updateCompState();

        uint256 rewardGot = IERC20(rewardCToken).balanceOf(address(this)); // COMP

        if (rewardGot > 0) {
            address uniswap = CompoundController(controller).uniswap();

            // should be like:
            // address[] memory path = new address[](3);
            // path[0] = address(rewardCToken);
            // path[1] = address(wethToken);
            // path[2] = address(uToken);
            address[] memory path = CompoundController(controller).getUniswapPath();

            // TODO: optimize pre-approve uniswap, gas
            IERC20(rewardCToken).approve(address(uniswap), rewardGot);

            IUniswapV2Router(uniswap).swapExactTokensForTokens(
                rewardGot,
                uint256(0),
                path,
                address(this),
                this.currentTime() + 1800
            );
        }

        uint256 underlyingGot = IERC20(uToken).balanceOf(address(this));

        if (underlyingGot == 0) {
          // got no goodies :(
          return;
        }

        uint256 extra;

        if (underlyingBefore > 0) {
          // someone sent us a present as underlying -> add it to the fees
          extra = underlyingBefore;
          underlyingGot -= extra;
        }

        if (rewardGot > rewardExpected) {
          // moar present as COMP reward -> add it to the fees
          // throw event
          uint256 rExtra = MathUtils.fractionOf(underlyingGot, (rewardGot - rewardExpected) * 1e18 / rewardGot);
          extra += rExtra;
          underlyingGot -= rExtra;
        }

        uint256 toCaller = MathUtils.fractionOf(underlyingGot, CompoundController(controller).HARVEST_REWARD());

        // deposit pool reward to compound - harvest reward + any goodies we received
        // any extra goodies go to fees
        _depositProviderInternal(underlyingGot - toCaller + extra, extra);

        uint256 reward = IERC20(uToken).balanceOf(address(this));

        // pay this man
        IERC20(uToken).transfer(caller, reward);

        emit Harvest(caller, rewardGot, rewardExpected, underlyingGot - toCaller + extra, extra, reward);
    }

    function transferFees()
      external
      override
      accountYield
    {
      // cleanup any cTokens dust or cTokens that may have been dumped on the pool
      if (ICTokenErc20(cToken).balanceOf(address(this)) > cTokenBalance) {
        underlyingFees += ICToken(cToken).exchangeRateStored() * (ICTokenErc20(cToken).balanceOf(address(this)) - cTokenBalance) / 1e18;
      }
      uint256 ctokensToPay = underlyingFees * 1e18 / ICToken(cToken).exchangeRateStored();
      uint256 err = ICToken(cToken).redeem(
          MathUtils.min(ctokensToPay, ICTokenErc20(cToken).balanceOf(address(this)))
      );

      require(0 == err, "PPC: transferFees redeem");

      underlyingFees = 0;
      cTokenBalance = ICTokenErc20(cToken).balanceOf(address(this));

      uint256 fees = IERC20(uToken).balanceOf(address(this));
      address to = IController(controller).feesOwner();

      IERC20(uToken).transfer(to, fees);

      emit TransferFees(msg.sender, to, fees);
    }

    // returns cumulatives and accumulates/updates internal state
    // oracle should call this when updating
    function cumulatives()
      external override
    returns(uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingBalance) {
        _accountYieldInternal();
        underlyingBalanceLast = this.underlyingBalance();
        return (cumulativeSecondlyYieldLast, cumulativeUnderlyingBalanceLast);
    }

    // returns cumulated yield per 1 underlying coin (ie 1 DAI, 1 ETH) times 1e18
    // per https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2OracleLibrary.sol#L16
    function currentCumulatives()
      external view override
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingBalance)
    {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        cumulativeSecondlyYield = cumulativeSecondlyYieldLast;
        cumulativeUnderlyingBalance = cumulativeUnderlyingBalanceLast;

        uint32 timeElapsed = blockTimestamp - cumulativeTimestampLast; // overflow is desired
        if (timeElapsed > 0) {
            if (underlyingBalanceLast > 0) {
              // cumulativeSecondlyYield overflows eventually,
              // due to the way it is used in the oracle that's ok,
              // as long as it doesn't overflow twice during the windowSize
              // see OraclelizedMock.cumulativeOverflowProof() for proof
              cumulativeSecondlyYield +=
                  // (this.underlyingBalance() - underlyingBalanceLast) * 1e18 -> overflows only if (this.underlyingBalance() - underlyingBalanceLast) >~ 10^41 ETH, DAI, USDC etc
                  // (this.underlyingBalance() - underlyingBalanceLast) never underflows
                  ((this.underlyingBalance() - underlyingBalanceLast) * 1e18) / underlyingBalanceLast;
            }
            cumulativeUnderlyingBalance += this.underlyingBalance() * timeElapsed;
        }
        return (cumulativeSecondlyYield, cumulativeUnderlyingBalance);
    }

    // current total underlying balance, as measured by pool
    function underlyingBalance()
      external view virtual override
    returns (uint256)
    {
        // https://compound.finance/docs#protocol-math
        return
            cTokenBalance * ICToken(cToken).exchangeRateStored() / 1e18;
    }

  // /externals

    function currentTime()
      public view virtual override
      returns (uint256)
    {
        // mockable
        return block.timestamp;
    }

    // computes how much COMP tokens compound.finance will give us at comptroller.claimComp()
    // note: have to do it because comptroller.claimComp() is callable by anyone
    // source: https://github.com/compound-finance/compound-protocol/blob/master/contracts/Comptroller.sol#L1145
    function compRewardExpected()
      public view virtual
      returns (uint256)
    {
        (uint224 supplyStateIndex, ) = IComptroller(comptroller).compSupplyState(cToken);
        uint256 supplyIndex = uint256(supplyStateIndex);
        uint256 supplierIndex = compSupplierIndexLast;

        uint256 deltaIndex = (supplyIndex).sub(supplierIndex); // a - b
        (, uint256 cumulativeUnderlyingBalanceNow) = this.currentCumulatives();
        uint256 timeElapsed = this.currentTime() - harvestedLast; // harvest() has require

        uint256 waUnderlyingTotal = ((cumulativeUnderlyingBalanceNow - cumulativeUnderlyingBalanceHarvestedLast) * 1e18 / timeElapsed);
        // uint256 supplierTokens = ICTokenErc20(cToken).balanceOf(address(this))
        uint256 supplierTokens = waUnderlyingTotal / ICToken(cToken).exchangeRateStored();
        return (supplierTokens).mul(deltaIndex).div(1e36); // a * b / doubleScale => uint
    }

  // internals

    function _depositProviderInternal(uint256 underlyingAmount_, uint256 takeFees_)
      internal
      accountYield
    {
        if (0 == cTokenBalance && 0 == compSupplierIndexLast) {
          // this will be called once only for the first comp deposit after pool deploy
          _updateCompState();
        }
        underlyingFees += takeFees_;

        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        // TODO: optimization, pre-approve provider: gas
        IERC20(uToken).approve(address(cToken), underlyingAmount_);
        uint256 err = ICToken(cToken).mint(underlyingAmount_);
        require(0 == err, "PPC: _depositProvider mint");
        cTokenBalance += ICTokenErc20(cToken).balanceOf(address(this)) - cTokensBefore;
    }

    function _accountYieldInternal()
      internal
    {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        uint32 timeElapsed = blockTimestamp - cumulativeTimestampLast; // overflow is desired
        // only for the first time in the block
        if (timeElapsed > 0) {
            // if there's underlying
            if (underlyingBalanceLast > 0) {
              // cumulativeSecondlyYieldLast overflows eventually,
              // due to the way it is used in the oracle that's ok,
              // as long as it doesn't overflow twice during the windowSize
              // see OraclelizedMock.cumulativeOverflowProof() for proof
              cumulativeSecondlyYieldLast +=
                  // (this.underlyingBalance() - underlyingBalanceLast) * 1e18 -> overflows only if (this.underlyingBalance() - underlyingBalanceLast) >~ 10^41 ETH, DAI, USDC etc
                  // (this.underlyingBalance() - underlyingBalanceLast) never underflows
                  ((this.underlyingBalance() - underlyingBalanceLast) * 1e18) / underlyingBalanceLast;
            }

            cumulativeUnderlyingBalanceLast += this.underlyingBalance() * timeElapsed;

            cumulativeTimestampLast = blockTimestamp;
        }
    }

    // call comptroller.enterMarkets()
    // needs to be called only once BUT before any interactions with the provider
    function _enterMarket()
      internal
    {
        address[] memory markets = new address[](1);
        markets[0] = cToken;
        uint256[] memory err = IComptroller(comptroller).enterMarkets(markets);
        require(err[0] == 0, "PPC: _enterMarket");
    }


    // creates checkpoint items needed to compute compRewardExpected()
    // needs to be called right after each claimComp(), and just before the first ever deposit
    function _updateCompState()
      internal
    {
        (uint224 supplyStateIndex, ) = IComptroller(comptroller).compSupplyState(cToken);
        compSupplierIndexLast = uint256(supplyStateIndex);
        (, cumulativeUnderlyingBalanceHarvestedLast) = this.currentCumulatives();
        harvestedLast = this.currentTime();
    }

    // /internals

}
