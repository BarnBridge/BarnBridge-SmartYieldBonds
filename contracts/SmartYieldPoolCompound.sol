// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import "./external-interfaces/compound-finance/ICToken.sol";
import "./external-interfaces/compound-finance/IComptroller.sol";

import "./ASmartYieldPool.sol";
import "./model/IBondModel.sol";

contract SmartYieldPoolCompound is ASmartYieldPool {
    using SafeMath for uint256;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;

    IComptroller public comptroller;

    // underlying token (ie. DAI)
    IERC20 public uToken;
    // claim token (ie. cDAI)
    address public cToken;
    // deposit reward token (ie. COMP)
    IERC20 public rewardCToken;
    // weth
    IERC20 public wethToken;

    IUniswapV2Router02 public uniswap;

    IBondModel public bondModel;

    // reward for calling harvest 3%
    uint256 public HARVEST_REWARD = 3 * 1e16; // 3%

    // cToken.balanceOf(this) measuring only deposits by users (excludes cToken transfers to this)
    uint256 public cTokenBalance = 0;

    // COMP reward
    // saved comptroller.compSupplyState(cToken) value @ the moment the pool harvested
    uint256 public compSupplierIndexLast;

    // when we last harvested
    uint256 public harvestedLast;

    // cumulative balanceOf @ last harvest
    uint256 public cumulativeUnderlyingTotalHarvestedLast;
    // /COMP reward

    constructor(string memory name, string memory symbol)
        ASmartYieldPool(name, symbol)
    {}

    function setup(
        address oracle_,
        address bondModel_,
        address bondToken_,
        address cToken_,
        uint8 underlyingDecimals_
    ) external {
        this.setOracle(oracle_);
        bondModel = IBondModel(bondModel_);
        bondToken = BondToken(bondToken_);
        cToken = cToken_;
        uToken = IERC20(ICToken(cToken_).underlying());
        underlyingDecimals = underlyingDecimals_;
        comptroller = IComptroller(ICToken(cToken_).comptroller());
    }

    function currentTime() external view virtual override returns (uint256) {
        return block.timestamp;
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal()
        external
        view
        virtual
        override
        returns (uint256)
    {
        // https://compound.finance/docs#protocol-math
        return
            cTokenBalance * ICToken(cToken).exchangeRateStored() / 1e18 - underlyingFees;
    }

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(uint256 _principalAmount, uint16 _forDays)
        public
        view
        override
        returns (uint256)
    {
        return bondModel.gain(address(this), _principalAmount, _forDays);
    }

    // called by anyone to convert pools COMP to underlying. caller gets HARVEST_REWARD of the harvest
    function harvest()
      external override {
        require(
          harvestedLast < this.currentTime(),
          "SYPComp: harvest later"
        );

        // this is 0 unless someone transfers underlying to the contract
        uint256 underlyingBefore = uToken.balanceOf(address(this));

        // COMP gets on the pool when:
        // 1) pool calls comptroller.claimComp()
        // 2) anyone calls comptroller.claimComp()
        // 3) anyone transfers COMP to the pool
        // we want to yield closest to 1+2 but not 3
        uint256 rewardExpected = compRewardExpected(); // COMP

        _claimComp();

        uint256 rewardGot = rewardCToken.balanceOf(address(this)); // COMP

        if (rewardGot > 0) {
            rewardCToken.approve(address(uniswap), rewardGot); //
            address[] memory path = new address[](3);
            path[0] = address(rewardCToken);
            path[1] = address(wethToken);
            path[2] = address(uToken);
            uniswap.swapExactTokensForTokens(
                rewardGot,
                uint256(0),
                path,
                address(this),
                this.currentTime() + 1800
            );
        }
        uint256 underlyingGot = uToken.balanceOf(address(this));

        if (underlyingGot == 0) {
          // got no goodies :(
          return;
        }

        uint256 extra = 0;

        if (underlyingBefore > 0) {
          // someone sent us a present as underlying, add it to the fees
          extra += underlyingBefore;
          underlyingGot -= extra;
        }

        if (rewardGot > rewardExpected) {
          // moar presents as COMP reward
          // throw event
          uint256 rExtra = MathUtils.fractionOf(underlyingGot, (rewardGot - rewardExpected) * 1e18 / rewardExpected);
          extra += rExtra;
          underlyingGot -= rExtra;
        }

        // any presents go to fees
        underlyingFees += extra;

        // pay this man
        uint256 toCaller = MathUtils.fractionOf(underlyingGot, HARVEST_REWARD);
        uToken.transfer(msg.sender, toCaller);

        // deposit pool reward to compound - harvest reward + any goodies we received
        _depositProvider(underlyingGot - toCaller + extra);
    }

    function _takeUnderlying(address _from, uint256 _underlyingAmount)
        internal
        override
    {
        require(
            _underlyingAmount <= uToken.allowance(_from, address(this)),
            "SYCOMP: _takeUnderlying allowance"
        );
        require(
            uToken.transferFrom(_from, address(this), _underlyingAmount),
            "SYCOMP: _takeUnderlying transferFrom"
        );
    }

    function _sendUnderlying(address _to, uint256 _underlyingAmount)
        internal
        override
        returns (bool)
    {
        return uToken.transfer(_to, _underlyingAmount);
    }

    function _depositProvider(uint256 _underlyingAmount) internal override {
        if (0 == cTokenBalance && 0 == compSupplierIndexLast) {
          // this will be called once only for the first comp deposit after pool deploy
          _enterMarket();
          _updateCompState();
        }
        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        uToken.approve(address(cToken), _underlyingAmount);
        uint256 err = ICToken(cToken).mint(_underlyingAmount);
        require(0 == err, "SYCOMP: _depositProvider mint");
        cTokenBalance += ICTokenErc20(cToken).balanceOf(address(this)) - cTokensBefore;
    }

    function _withdrawProvider(uint256 _underlyingAmount) internal override {
        uint256 cTokensBefore = ICTokenErc20(cToken).balanceOf(address(this));
        uint256 err = ICToken(cToken).redeemUnderlying(_underlyingAmount);
        require(0 == err, "SYCOMP: _withdrawProvider redeemUnderlying");
        cTokenBalance -= cTokensBefore - ICTokenErc20(cToken).balanceOf(address(this));
    }

    // call comptroller.enterMarkets()
    // needs to be called only once BUT before any interactions with provider
    function _enterMarket() internal {
        address[] memory markets = new address[](1);
        markets[0] = cToken;
        uint256[] memory err = comptroller.enterMarkets(markets);
        require(err[0] == 0, "SYCOMP: _enterMarket");
    }

    // COMP reward
    function _updateCompState() internal {
        (uint224 supplyStateIndex, ) = comptroller.compSupplyState(cToken);
        compSupplierIndexLast = uint256(supplyStateIndex);
        (, cumulativeUnderlyingTotalHarvestedLast, ) = this.currentCumulatives();
        harvestedLast = this.currentTime();
    }

    // call comptroller.claimComp()
    function _claimComp() internal {
        address[] memory holders = new address[](1);
        holders[0] = address(this);
        address[] memory markets = new address[](1);
        markets[0] = cToken;

        comptroller.claimComp(holders, markets, false, true);
        _updateCompState();
    }

    // computes how much COMP tokens compound.finance will give us
    // note: have to do it because comptroller.claimComp() is callable by anyone
    // source: https://github.com/compound-finance/compound-protocol/blob/master/contracts/Comptroller.sol#L1145
    function compRewardExpected() public view returns (uint256) {
        (uint224 supplyStateIndex, ) = comptroller.compSupplyState(cToken);
        uint256 supplyIndex = uint256(supplyStateIndex);
        uint256 supplierIndex = compSupplierIndexLast;

        uint256 deltaIndex = (supplyIndex).sub(supplierIndex); // a - b
        (, uint256 cumulativeUnderlyingTotalNow, ) = this.currentCumulatives();
        uint256 timeElapsed = this.currentTime() - harvestedLast;
        // uint256 supplierTokens = ICTokenErc20(cToken).balanceOf(address(this))
        uint256 supplierTokens = ((cumulativeUnderlyingTotalNow - cumulativeUnderlyingTotalHarvestedLast) * 1e18 / timeElapsed) / ICToken(cToken).exchangeRateStored();
        return (supplierTokens).mul(deltaIndex).div(1e36); // a * b / doubleScale => uint
    }
    // /COMP reward

}
