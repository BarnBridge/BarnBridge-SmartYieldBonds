// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./external-interfaces/uniswap/IUniswapV2Router.sol";

import "./external-interfaces/compound-finance/ICToken.sol";
import "./external-interfaces/compound-finance/IComptroller.sol";

import "./ControllerCompound.sol";
import "./ASmartYieldPool.sol";

contract SmartYieldPoolCompound is ASmartYieldPool {
    using SafeMath for uint256;

    // cToken.balanceOf(this) measuring only deposits by users (excludes cToken transfers to pool)
    uint256 public cTokenBalance;

    // --- COMP reward checkpoint
    // saved comptroller.compSupplyState(cToken) value @ the moment the pool harvested
    uint256 public compSupplierIndexLast;

    // cumulative balanceOf @ last harvest
    uint256 public cumulativeUnderlyingTotalHarvestedLast;

    // when we last harvested
    uint256 public harvestedLast;
    // --- /COMP reward checkpoint

    // underlying token (ie. DAI)
    address public uToken; // IERC20

    // claim token (ie. cDAI)
    address public cToken;

    // compound.finance Comptroller
    address public comptroller; // IComptroller

    // deposit reward token (ie. COMP)
    address public rewardCToken; // IERC20

    // weth
    address public wethToken; //IERC20

    address public uniswap; //IUniswapV2Router

    constructor()
        ASmartYieldPool()
        Governed()
    { }

    function setup(
        address controller_,
        address seniorBond_,
        address juniorBond_,
        address juniorToken_,
        address cToken_
    )
      external
      onlyDao
    {
        controller = controller_;
        seniorBond = seniorBond_;
        juniorBond = juniorBond_;
        juniorToken = juniorToken_;
        cToken = cToken_;
        uToken = ICToken(cToken_).underlying();
        comptroller = ICToken(cToken_).comptroller();
    }

    function currentTime()
      external view virtual override
      returns (uint256)
    {
        // mockable
        return block.timestamp;
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal()
      external view virtual override
      returns (uint256)
    {
        // https://compound.finance/docs#protocol-math
        return
            cTokenBalance * ICToken(cToken).exchangeRateStored() / 1e18 - st.underlyingFees - st.underlyingLiquidatedJuniors;
    }

    function providerRatePerDay() external view virtual override returns (uint256) {
        return IYieldOracle(ControllerCompound(controller).oracle()).consult(1 days);
    }

    // called by anyone to convert pool's COMP -> underlying and then deposit it. caller gets HARVEST_REWARD of the harvest
    function harvest()
      external override
    {
        require(
          harvestedLast < this.currentTime(),
          "SYPComp: harvest later"
        );

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
            IERC20(rewardCToken).approve(address(uniswap), rewardGot); //
            address[] memory path = new address[](3);
            path[0] = address(rewardCToken);
            path[1] = address(wethToken);
            path[2] = address(uToken);
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

        uint256 extra = 0;

        if (underlyingBefore > 0) {
          // someone sent us a present as underlying -> add it to the fees
          extra += underlyingBefore;
          underlyingGot -= extra;
        }

        if (rewardGot > rewardExpected) {
          // moar present as COMP reward -> add it to the fees
          // throw event
          uint256 rExtra = MathUtils.fractionOf(underlyingGot, (rewardGot - rewardExpected) * 1e18 / rewardExpected);
          extra += rExtra;
          underlyingGot -= rExtra;
        }

        // any presents go to fees
        st.underlyingFees += extra;

        uint256 toCaller = MathUtils.fractionOf(underlyingGot, ControllerCompound(controller).HARVEST_REWARD());

        // deposit pool reward to compound - harvest reward + any goodies we received
        _depositProvider(underlyingGot - toCaller + extra);

        // pay this man
        IERC20(uToken).transfer(msg.sender, IERC20(uToken).balanceOf(address(this)));
    }

    // take _underlyingAmount from _from
    function _takeUnderlying(address _from, uint256 _underlyingAmount)
      internal override
    {
        require(
            _underlyingAmount <= IERC20(uToken).allowance(_from, address(this)),
            "SYCOMP: _takeUnderlying allowance"
        );
        require(
            IERC20(uToken).transferFrom(_from, address(this), _underlyingAmount),
            "SYCOMP: _takeUnderlying transferFrom"
        );
    }

    // transfer away _underlyingAmount to _to
    function _sendUnderlying(address _to, uint256 _underlyingAmount)
      internal override
      returns (bool)
    {
        return IERC20(uToken).transfer(_to, _underlyingAmount);
    }

    // deposit _underlyingAmount with the liquidity provider adds resulting cTokens to cTokenBalance
    // on the very first call enters the compound.finance market and saves the checkpoint needed for compRewardExpected
    function _depositProvider(uint256 _underlyingAmount)
      internal override
    {
        if (0 == cTokenBalance && 0 == compSupplierIndexLast) {
          // this will be called once only for the first comp deposit after pool deploy
          _enterMarket();
          _updateCompState();
        }
        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        IERC20(uToken).approve(address(cToken), _underlyingAmount);
        uint256 err = ICToken(cToken).mint(_underlyingAmount);
        require(0 == err, "SYCOMP: _depositProvider mint");
        cTokenBalance += ICTokenErc20(cToken).balanceOf(address(this)) - cTokensBefore;
    }

    // withdraw _underlyingAmount from the liquidity provider, substract the lost cTokens from cTokenBalance
    function _withdrawProvider(uint256 _underlyingAmount)
      internal override
    {
        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        uint256 err = ICToken(cToken).redeemUnderlying(_underlyingAmount);
        require(0 == err, "SYCOMP: _withdrawProvider redeemUnderlying");
        cTokenBalance -= cTokensBefore - ICTokenErc20(cToken).balanceOf(address(this));
    }

    // call comptroller.enterMarkets()
    // needs to be called only once BUT before any interactions with the provider
    function _enterMarket()
      internal
    {
        address[] memory markets = new address[](1);
        markets[0] = cToken;
        uint256[] memory err = IComptroller(comptroller).enterMarkets(markets);
        require(err[0] == 0, "SYCOMP: _enterMarket");
    }

    // --- COMP reward

    // creates checkpoint items needed to compute compRewardExpected()
    // needs to be called right after each claimComp(), and just before the first ever deposit
    function _updateCompState()
      internal
    {
        (uint224 supplyStateIndex, ) = IComptroller(comptroller).compSupplyState(cToken);
        compSupplierIndexLast = uint256(supplyStateIndex);
        (, cumulativeUnderlyingTotalHarvestedLast, ) = this.currentCumulatives();
        harvestedLast = this.currentTime();
    }

    // computes how much COMP tokens compound.finance will give us at comptroller.claimComp()
    // note: have to do it because comptroller.claimComp() is callable by anyone
    // source: https://github.com/compound-finance/compound-protocol/blob/master/contracts/Comptroller.sol#L1145
    function compRewardExpected()
      public view
      returns (uint256)
    {
        (uint224 supplyStateIndex, ) = IComptroller(comptroller).compSupplyState(cToken);
        uint256 supplyIndex = uint256(supplyStateIndex);
        uint256 supplierIndex = compSupplierIndexLast;

        uint256 deltaIndex = (supplyIndex).sub(supplierIndex); // a - b
        (, uint256 cumulativeUnderlyingTotalNow, ) = this.currentCumulatives();
        uint256 timeElapsed = this.currentTime() - harvestedLast; // harvest() has require

        uint256 waUnderlyingTotal = ((cumulativeUnderlyingTotalNow - cumulativeUnderlyingTotalHarvestedLast) * 1e18 / timeElapsed);
        // uint256 supplierTokens = ICTokenErc20(cToken).balanceOf(address(this))
        uint256 supplierTokens = waUnderlyingTotal / ICToken(cToken).exchangeRateStored();
        return (supplierTokens).mul(deltaIndex).div(1e36); // a * b / doubleScale => uint
    }
    // --- /COMP reward

    function transferFees()
      public
      override
    {
      // cleanup any cTokens dust or cTokens that may have been dumped on the pool
      if (ICTokenErc20(cToken).balanceOf(address(this)) > cTokenBalance) {
        st.underlyingFees += ICToken(cToken).exchangeRateStored() * (ICTokenErc20(cToken).balanceOf(address(this)) - cTokenBalance) / 1e18;
      }
      uint256 ctokensToPay = st.underlyingFees * 1e18 / ICToken(cToken).exchangeRateStored();
      uint256 err = ICToken(cToken).redeem(
          MathUtils.min(ctokensToPay, ICTokenErc20(cToken).balanceOf(address(this)))
      );
      require(0 == err, "SYCOMP: transferFees redeem");
      st.underlyingFees = 0;
      cTokenBalance = ICTokenErc20(cToken).balanceOf(address(this));
      IERC20(uToken).transfer(IController(controller).feesOwner(), IERC20(uToken).balanceOf(address(this)));
    }

}
