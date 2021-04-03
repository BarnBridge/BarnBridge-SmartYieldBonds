// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";

import "./../lib/uniswap/UniswapV2Library.sol";
import "./../lib/uniswap/UniswapV2OracleLibrary.sol";
import "./../lib/uniswap/FixedPoint.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/uniswap/IUniswapV2Router.sol";
import "./../external-interfaces/mai3/IMai3Oracle.sol";

import "./../IController.sol";
import "./../oracle/ISignedYieldOracle.sol";
import "./../oracle/ISignedYieldOraclelizable.sol";

import "./Mai3Provider.sol";
import "./IMai3Cumulator.sol";

contract Mai3Controller is IController, ISignedYieldOraclelizable, IMai3Cumulator {
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    address public constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant UNISWAP_ROUTER_V2 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant DOUBLE_SCALE = 1e36;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    // underlying token
    address public uToken;

    // share token of liquidity pool
    address public shareToken;

    // governor address of liquidity pool
    address public governor;

    // reward token address (MCB)
    address public rewardToken;

    // the number of MCB that we have harvested
    uint256 public cumulativeHarvestedReward;

    // last time we have (cumulativeHarvestedReward + that we can earn)
    uint256 public prevCumulativeEarnedReward;

    uint256 public harvestedLast;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevNetAssetValue;

    // cumulative supply rate += ((new underlying) / underlying)
    int256 public cumulativeSupplyRate;

    // cumulative MCB distribution rate += ((new underlying) / underlying)
    uint256 public cumulativeDistributionRate;

    // uniswap path for MCB to underlying
    address[] public uniswapPath;

    // uniswap pairs for MCB to underlying
    address[] public uniswapPairs;

    // uniswap cumulative prices needed for MCB to underlying
    uint256[] public uniswapPriceCumulatives;

    // keys for uniswap cumulativePrice{0 | 1}
    uint8[] public uniswapPriceKeys;

    // Mai3-compatitable oralce for MCB to underlying spot price
    address public mcbSpotOracle;

    // A baseline of the supply rate, set by the creator
    uint256 public initialDailySupplyRate;

    event Harvest(
        address indexed caller,
        uint256 mcbRewardTotal,
        uint256 mcbRewardSold,
        uint256 underlyingPoolShare,
        uint256 underlyingReward,
        uint256 harvestCost
    );

    modifier onlyPool {
        require(msg.sender == pool, "CC: only pool");
        _;
    }

    constructor(
        address pool_,
        address smartYield_,
        address bondModel_,
        address[] memory uniswapPath_,
        address mcbSpotOracle_,
        uint256 initialDailySupplyRate_
    ) IController() {
        pool = pool_;
        smartYield = smartYield_;
        mcbSpotOracle = mcbSpotOracle_;
        initialDailySupplyRate = initialDailySupplyRate_;

        uToken = Mai3Provider(pool).uToken();
        shareToken = Mai3Provider(pool).shareToken();
        governor = Mai3Provider(pool).governor();
        rewardToken = ILpGovernor(governor).rewardToken();

        setBondModel(bondModel_);
        setUniswapPath(uniswapPath_);

        updateAllowances();
    }

    function setMCBOracle(address mcbSpotOracle_) public onlyDao {
        mcbSpotOracle = mcbSpotOracle_;
    }

    function setInitialDailySupplyRate(uint256 rate_) public onlyDao {
        initialDailySupplyRate = rate_;
    }

    function updateAllowances() public {
        uint256 routerRewardAllowance = IERC20(rewardToken).allowance(address(this), uniswapRouter());
        IERC20(rewardToken).safeIncreaseAllowance(uniswapRouter(), MAX_UINT256.sub(routerRewardAllowance));

        uint256 poolUnderlyingAllowance = IERC20(uToken).allowance(address(this), address(pool));
        IERC20(uToken).safeIncreaseAllowance(address(pool), MAX_UINT256.sub(poolUnderlyingAllowance));
    }

    // should start with rewardCToken and with uToken, and have intermediary hops if needed
    // path[0] = address(rewardCToken);
    // path[1] = address(wethToken);
    // path[2] = address(uToken);
    function setUniswapPath(address[] memory newUniswapPath_) public virtual onlyDao {
        require(2 <= newUniswapPath_.length, "CC: setUniswapPath length");

        uniswapPath = newUniswapPath_;

        address[] memory newUniswapPairs = new address[](newUniswapPath_.length - 1);
        uint8[] memory newUniswapPriceKeys = new uint8[](newUniswapPath_.length - 1);

        for (uint256 f = 0; f < newUniswapPath_.length - 1; f++) {
            newUniswapPairs[f] = UniswapV2Library.pairFor(UNISWAP_FACTORY, newUniswapPath_[f], newUniswapPath_[f + 1]);
            (address token0, ) = UniswapV2Library.sortTokens(newUniswapPath_[f], newUniswapPath_[f + 1]);
            newUniswapPriceKeys[f] = token0 == newUniswapPath_[f] ? 0 : 1;
        }

        uniswapPairs = newUniswapPairs;
        uniswapPriceKeys = newUniswapPriceKeys;
        uniswapPriceCumulatives = uniswapPriceCumulativesNow();
    }

    function uniswapRouter() public view virtual returns (address) {
        // mockable
        return UNISWAP_ROUTER_V2;
    }

    function getTimestamp() public view virtual returns (uint256) {
        //mockable
        return block.timestamp;
    }

    // claims and sells MCB on uniswap, returns total received mcb and caller reward
    function harvest(uint256 maxMCBAmount_) public returns (uint256 mcbGot, uint256 underlyingHarvestReward) {
        uint256 timestamp = getTimestamp();
        require(harvestedLast < timestamp, "PPC: harvest later");

        address caller = msg.sender;

        // To prevent someone transfering a large amount MCB to the pool to mislead the reward stats
        uint256 harvestedReward = ILpGovernor(governor).earned(pool);
        // claim pool MCB
        Mai3Provider(pool).getReward();
        uint256 rewardBalance = IERC20(rewardToken).balanceOf(pool);
        if (rewardBalance < harvestedReward) {
            harvestedReward = rewardBalance;
        }

        cumulativeHarvestedReward = cumulativeHarvestedReward.add(harvestedReward);

        // transfer all mcb from pool to self
        IERC20(rewardToken).safeTransferFrom(pool, address(this), harvestedReward);
        uint256 mcbRewardTotal = IERC20(rewardToken).balanceOf(address(this)); // MCB

        // only sell upmost maxMCBAmount_, if maxMCBAmount_ == 0 sell all
        maxMCBAmount_ = (maxMCBAmount_ == 0) ? mcbRewardTotal : maxMCBAmount_;
        uint256 mcbRewardSold = MathUtils.min(maxMCBAmount_, mcbRewardTotal);

        require(mcbRewardSold > 0, "PPC: harvested nothing");

        // pool share is (mcb to underlying) - (harvest cost percent)
        uint256 poolShare = MathUtils.fractionOf(quoteSpotMCBToUnderlying(mcbRewardSold), EXP_SCALE.sub(HARVEST_COST));

        // make sure we get at least the poolShare
        IUniswapV2Router(uniswapRouter()).swapExactTokensForTokens(
            mcbRewardSold,
            poolShare,
            uniswapPath,
            address(this),
            timestamp
        );

        uint256 underlyingGot = IERC20(uToken).balanceOf(address(this));

        require(underlyingGot >= poolShare, "PPC: harvest poolShare");

        // deposit pool reward share with liquidity provider
        Mai3Provider(pool)._takeUnderlying(address(this), poolShare);
        Mai3Provider(pool)._depositProvider(poolShare, 0);

        // pay caller
        uint256 callerReward = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransfer(caller, callerReward);

        harvestedLast = timestamp;

        emit Harvest(caller, mcbRewardTotal, mcbRewardSold, poolShare, callerReward, HARVEST_COST);

        return (mcbRewardTotal, callerReward);
    }

    function _beforeShareTokenBalanceChange() external override onlyPool {}

    function _afterShareTokenBalanceChange(uint256 prevShareTokenBalance_) external override onlyPool {
        updateCumulativesInternal(prevShareTokenBalance_);
        ISignedYieldOracle(oracle).update();
    }

    // returns the provider rate per day
    // if the oracle is ready, use the oracle, otherwise use the spot MCB rate only
    function providerRatePerDay() public virtual override returns (uint256) {
        uint256 rate = 0;
        if (ISignedYieldOracle(oracle).isAvailabe()) {
            int256 signedRate = ISignedYieldOracle(oracle).consultSigned(1 days);
            if (signedRate < 0) {
                return 0;
            }
            rate = signedRate.toUint256();
        } else {
            rate = initialDailySupplyRate.add(spotDailyDistributionRateProvider());
        }

        return MathUtils.min(rate, BOND_MAX_RATE_PER_DAY);
    }

    function cumulatives() external override returns (int256) {
        if (cumulativeSupplyRate < 0) {
            return 0;
        }

        uint256 timeElapsed = getTimestamp() - prevCumulationTime;

        // only cumulate once per block
        if (0 == timeElapsed) {
            return cumulativeSupplyRate.add(cumulativeDistributionRate.toInt256());
        }

        uint256 shareTokenBalance = Mai3Provider(pool).shareTokenBalance();
        updateCumulativesInternal(shareTokenBalance);

        return cumulativeSupplyRate.add(cumulativeDistributionRate.toInt256());
    }

    function updateCumulativesInternal(uint256 prevShareTokenBalance_) private {
        uint256 timestamp = getTimestamp();
        uint256 timeElapsed = timestamp - prevCumulationTime;

        // only cumulate once per block
        if (0 == timeElapsed) {
            return;
        }

        uint256[] memory currentUniswapPriceCumulatives = uniswapPriceCumulativesNow();

        uint256 cumulativeEarnedRewardNow = cumulativeEarnedReward();

        uint256 netAssetValueCurrent = Mai3Provider(pool).netAssetValueCurrent();

        if (prevNetAssetValue > 0) {
            int256 prevNetAssetValueInt256 = prevNetAssetValue.toInt256();
            // cumulate a new supplyRate delta: cumulativeSupplyRate += (netAssetValueCurrent() - prevNetAssetValue) / prevNetAssetValue
            cumulativeSupplyRate = cumulativeSupplyRate.add(
                netAssetValueCurrent.toInt256().sub(prevNetAssetValueInt256).mul(int256(EXP_SCALE)).div(prevNetAssetValueInt256)
            );

            if (cumulativeEarnedRewardNow > prevCumulativeEarnedReward) {
                uint256 expectedMCB = cumulativeEarnedRewardNow.sub(prevCumulativeEarnedReward);
                uint256 expectedMCBInUnderlying =
                    quoteMCBToUnderlying(expectedMCB, timeElapsed, uniswapPriceCumulatives, currentUniswapPriceCumulatives);

                uint256 poolShare = MathUtils.fractionOf(expectedMCBInUnderlying, EXP_SCALE.sub(HARVEST_COST));
                // cumulate a new distributionRate delta: cumulativeDistributionRate += (expectedDistributeSupplierComp in underlying - harvest cost) / prevUnderlyingBalance
                cumulativeDistributionRate = cumulativeDistributionRate.add(
                    poolShare.mul(EXP_SCALE).div(shareTokensToUnderlying(prevShareTokenBalance_, prevNetAssetValue))
                );
            }
        }

        prevCumulationTime = timestamp;

        // uniswap cumulatives only change once per block
        uniswapPriceCumulatives = currentUniswapPriceCumulatives;

        prevCumulativeEarnedReward = cumulativeEarnedRewardNow;

        // exchangeRateStored can increase multiple times per block
        prevNetAssetValue = netAssetValueCurrent;
    }

    function shareTokensToUnderlying(uint256 shareTokens_, uint256 exchangeRate_) public pure returns (uint256) {
        return shareTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

    function uniswapPriceCumulativeNow(address pair_, uint8 priceKey_) public view returns (uint256) {
        (uint256 price0, uint256 price1, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair_);
        return 0 == priceKey_ ? price0 : price1;
    }

    function uniswapPriceCumulativesNow() public view virtual returns (uint256[] memory) {
        uint256[] memory newUniswapPriceCumulatives = new uint256[](uniswapPairs.length);
        for (uint256 f = 0; f < uniswapPairs.length; f++) {
            newUniswapPriceCumulatives[f] = uniswapPriceCumulativeNow(uniswapPairs[f], uniswapPriceKeys[f]);
        }
        return newUniswapPriceCumulatives;
    }

    function quoteMCBToUnderlying(
        uint256 compIn_,
        uint256 timeElapsed_,
        uint256[] memory prevUniswapPriceCumulatives_,
        uint256[] memory nowUniswapPriceCumulatives_
    ) public pure returns (uint256) {
        uint256 amountIn = compIn_;
        for (uint256 f = 0; f < prevUniswapPriceCumulatives_.length; f++) {
            amountIn = uniswapAmountOut(prevUniswapPriceCumulatives_[f], nowUniswapPriceCumulatives_[f], timeElapsed_, amountIn);
        }
        return amountIn;
    }

    function uniswapAmountOut(
        uint256 prevPriceCumulative_,
        uint256 nowPriceCumulative_,
        uint256 timeElapsed_,
        uint256 amountIn_
    ) public pure returns (uint256) {
        // per: https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleSlidingWindowOracle.sol#L93
        FixedPoint.uq112x112 memory priceAverage =
            FixedPoint.uq112x112(uint224((nowPriceCumulative_ - prevPriceCumulative_) / timeElapsed_));
        return FixedPoint.decode144(FixedPoint.mul(priceAverage, amountIn_));
    }

    function cumulativeEarnedReward() public view returns (uint256) {
        return cumulativeHarvestedReward.add(ILpGovernor(governor).earned(pool));
    }

    function quoteSpotMCBToUnderlying(uint256 mcbIn_) public returns (uint256) {
        IMai3Oracle oracle = IMai3Oracle(mcbSpotOracle);
        if (oracle.isTerminated()) {
            return 0;
        }
        (int256 price, ) = oracle.priceTWAPShort();
        return mcbIn_.mul(price.toUint256()).div(EXP_SCALE);
    }

    // MCB distribution rate per day
    function spotDailyDistributionRateProvider() public returns (uint256) {
        uint256 rewardRate = ILpGovernor(governor).rewardRate();

        uint256 dailyMCBPerShare = rewardRate.mul(BLOCKS_PER_DAY).div(IERC20(rewardToken).totalSupply());

        uint256 exchangeRate = Mai3Provider(pool).netAssetValueCurrent();

        return quoteSpotMCBToUnderlying(dailyMCBPerShare).div(exchangeRate);
    }
}
