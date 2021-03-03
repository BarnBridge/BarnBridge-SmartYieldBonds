// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/uniswap/UniswapV2Library.sol";
import "./../lib/uniswap/UniswapV2OracleLibrary.sol";
import "./../lib/uniswap/FixedPoint.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/compound-finance/ICToken.sol";
import "./../external-interfaces/compound-finance/IComptroller.sol";
import "./../external-interfaces/compound-finance/IUniswapAnchoredOracle.sol";
import "./../external-interfaces/uniswap/IUniswapV2Router.sol";

import "./CompoundProvider.sol";

import "./../IController.sol";
import "./ICompoundCumulator.sol";

contract CompoundController is IController, ICompoundCumulator {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant EXP_SCALE = 1e18;
    uint256 public constant DOUBLE_SCALE = 1e36;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    // compound provider pool
    address public pool;

    // uniswap factory
    address public uniswap;

    uint256 public harvestedLast;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevExchnageRateStored;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    // cumulative COMP distribution rate += ((new underlying) / underlying)
    uint256 public cumulativeDistributionRate;

    // compound.finance comptroller.compSupplyState right after the previous deposit/withdraw
    IComptroller.CompMarketState public prevCompSupplyState;

    // uniswap path for COMP to underlying
    address[] public uniswapPath;

    // uniswap pairs for COMP to underlying
    address[] public uniswapPairs;

    // uniswap cumulative prices for COMP to underlying
    uint256[] public uniswapPriceCumulatives;

    // uniswap cumulativePrice{0 | 1}
    uint8[] public uniswapPriceKeys;


    event Harvest(address indexed caller, uint256 rewardTokenGot, uint256 underlyingPoolShare, uint256 underlyingReward, uint256 harvestCost);


    modifier onlyPool {
      require(
        msg.sender == pool,
        "CC: only pool"
      );
      _;
    }

    constructor(
      address uniswap_,
      address[] memory uniswapPath_
    )
      IController()
    {
      setUniswap(uniswap_);
      setUniswapPath(uniswapPath_);
    }

    function setUniswap(address newValue_)
      public
      onlyDaoOrGuardian
    {
      uniswap = newValue_;
    }

    // should start with rewardCToken and with uToken, and have intermediary hops if needed
    // path[0] = address(rewardCToken);
    // path[1] = address(wethToken);
    // path[2] = address(uToken);
    function setUniswapPath(address[] memory newUniswapPath_)
      public
      onlyDaoOrGuardian
    {
        require(
          2 <= uniswapPath.length,
          "CC: setUniswapPath length"
        );

        uniswapPath = newUniswapPath_;

        address[] memory newUniswapPairs = new address[](newUniswapPath_.length - 1);
        //uint256[] memory newUniswapPriceCumulatives = new uint256[](newUniswapPath_.length - 1);
        uint8[] memory newUniswapPriceKeys = new uint8[](newUniswapPath_.length - 1);

        for (uint256 f = 0; f < newUniswapPath_.length - 1; f++) {
          newUniswapPairs[f] = UniswapV2Library.pairFor(uniswap, newUniswapPath_[f], newUniswapPath_[f + 1]);
          (address token0, ) = UniswapV2Library.sortTokens(newUniswapPath_[f], newUniswapPath_[f + 1]);
          newUniswapPriceKeys[f] = token0 == newUniswapPath_[f] ? 0 : 1;
        }

        uniswapPairs = newUniswapPairs;
        uniswapPriceKeys = newUniswapPriceKeys;
        uniswapPriceCumulatives = uniswapPriceCumulativesNow();
    }

    function getUniswapPath()
      public view
    returns (address[] memory)
    {
      return uniswapPath;
    }

    function harvest()
      public
    returns (uint256)
    {
        require(
          harvestedLast < block.timestamp,
          "PPC: harvest later"
        );

        ICToken cToken = ICToken(CompoundProvider(pool).cToken());
        IERC20 uToken = IERC20(CompoundProvider(pool).uToken());
        IComptroller comptroller = IComptroller(cToken.comptroller());
        IERC20 rewardToken = IERC20(comptroller.getCompAddress());

        address caller = msg.sender;

        address[] memory holders = new address[](1);
        holders[0] = pool;
        address[] memory markets = new address[](1);
        markets[0] = address(cToken);
        comptroller.claimComp(holders, markets, false, true);

        rewardToken.safeTransferFrom(pool, address(this), rewardToken.balanceOf(pool));
        uint256 rewardGot = rewardToken.balanceOf(address(this)); // COMP

        if (rewardGot == 0) {
          return 0;
        }

        uint256 poolShare = MathUtils.fractionOf(quoteSpotCompToUnderlying(rewardGot), EXP_SCALE - HARVEST_COST);

        // TODO: optimize pre-approve uniswap, gas
        rewardToken.safeApprove(address(uniswap), rewardGot);
        IUniswapV2Router(uniswap).swapExactTokensForTokens(
            rewardGot,
            poolShare,
            uniswapPath,
            address(this),
            block.timestamp
        );

        uint256 underlyingGot = uToken.balanceOf(address(this));

        require(
          underlyingGot >= poolShare,
          "PPC: harvest poolShare"
        );

        // deposit pool reward share with liquidity provider
        CompoundProvider(pool)._depositProvider(poolShare, 0);

        uint256 reward = uToken.balanceOf(address(this));

        // pay caller
        uToken.safeTransfer(caller, reward);

        harvestedLast = block.timestamp;

        emit Harvest(caller, rewardGot, poolShare, reward, HARVEST_COST);

        return reward;
    }

    function _beforeCTokenBalanceChange()
      external override
      onlyPool
    { }

    function _afterCTokenBalanceChange(uint256 prevCTokenBalance_)
      external override
      onlyPool
    {
      // at this point compound.finance state is updated since the pool did a deposit or withdrawl just before, so no need to ping
      updateCumulativesInternal(prevCTokenBalance_, false);
    }

    function updateCumulativesInternal(uint256 prevCTokenBalance_, bool pingCompound_) private {
      uint256 timeElapsed = prevCumulationTime - block.timestamp;

      // only cumulate once per block
      if (0 == timeElapsed) {
        return;
      }

      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IComptroller comptroller = IComptroller(cToken.comptroller());

      uint256[] memory currentUniswapPriceCumulatives = uniswapPriceCumulativesNow();

      if (pingCompound_) {
        // echangeRateStored will be up to date below
        cToken.accrueInterest();
        // compSupplyState will be up to date below
        comptroller.mintAllowed(address(cToken), address(this), 0);
      }

      (uint224 nowSupplyStateIndex, uint32 blk) = comptroller.compSupplyState(address(cToken));

      if (prevExchnageRateStored > 0) {
        // cumulate a new supplyRate delta: cumulativeSupplyRate += (cToken.exchangeRateStored() - prevExchnageRateStored) / prevExchnageRateStored
        // cumulativeSupplyRate eventually overflows, but that's ok due to the way it's used in the oracle
        cumulativeSupplyRate += cToken.exchangeRateStored().sub(prevExchnageRateStored).div(prevExchnageRateStored);

        if (prevCTokenBalance_ > 0) {
          uint256 expectedCompInUnderlying = quoteCompToUnderlying(
            expectedDistributeSupplierComp(prevCTokenBalance_, nowSupplyStateIndex, prevCompSupplyState.index),
            timeElapsed,
            uniswapPriceCumulatives,
            currentUniswapPriceCumulatives
          );

          uint256 poolShare = MathUtils.fractionOf(expectedCompInUnderlying, 1e18 - HARVEST_COST);
          // cumulate a new distributionRate delta: cumulativeDistributionRate += (expectedDistributeSupplierComp in underlying - harvest cost) / prevUnderlyingBalance
          // cumulativeDistributionRate eventually overflows, but that's ok due to the way it's used in the oracle
          cumulativeDistributionRate += poolShare.div(cTokensToUnderlying(prevCTokenBalance_, prevExchnageRateStored));
        }
      }

      prevCumulationTime = block.timestamp;

      // uniswap cumulatives only change once per block
      uniswapPriceCumulatives = currentUniswapPriceCumulatives;

      // compSupplyState changes only once per block
      prevCompSupplyState = IComptroller.CompMarketState(nowSupplyStateIndex, blk);

      // exchangeRateStored can increase multiple times per block
      prevExchnageRateStored = cToken.exchangeRateStored();
    }

    // computes how much COMP tokens compound.finance will have given us after a mint/redeem/redeemUnderlying
    // source: https://github.com/compound-finance/compound-protocol/blob/master/contracts/Comptroller.sol#L1145
    function expectedDistributeSupplierComp(
      uint256 cTokenBalance_, uint224 nowSupplyStateIndex_, uint224 prevSupplyStateIndex_
    ) public pure returns (uint256) {
      uint256 supplyIndex = uint256(nowSupplyStateIndex_);
      uint256 supplierIndex = uint256(prevSupplyStateIndex_);
      uint256 deltaIndex = (supplyIndex).sub(supplierIndex); // a - b
      return (cTokenBalance_).mul(deltaIndex).div(DOUBLE_SCALE); // a * b / doubleScale => uint
    }

    function cTokensToUnderlying(
      uint256 cTokens_, uint256 exchangeRate_
    ) public pure returns (uint256) {
      return cTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

    function uniswapPriceCumulativeNow(
      address pair_, uint8 priceKey_
    ) public view returns (uint256) {
      (uint256 price0, uint256 price1, ) = UniswapV2OracleLibrary.currentCumulativePrices(pair_);
      return 0 == priceKey_ ? price0 : price1;
    }

    function uniswapPriceCumulativesNow()
      public view returns (uint256[] memory)
    {
      uint256[] memory newUniswapPriceCumulatives = new uint256[](uniswapPath.length - 1);
      for (uint256 f = 0; f < uniswapPath.length - 1; f++) {
        newUniswapPriceCumulatives[f] = uniswapPriceCumulativeNow(uniswapPairs[f], uniswapPriceKeys[f]);
      }
      return newUniswapPriceCumulatives;
    }

    function _storeUniswapPriceCumulatives()
      private
    {
      for (uint256 f = 0; f < uniswapPairs.length; f++) {
        uniswapPriceCumulatives[f] = uniswapPriceCumulativeNow(uniswapPairs[f], uniswapPriceKeys[f]);
      }
    }

    function quoteCompToUnderlying(
      uint256 compIn_, uint256 timeElapsed_, uint256[] memory prevUniswapPriceCumulatives_, uint256[] memory nowUniswapPriceCumulatives_
    ) public pure returns (uint256) {
      uint256 amountIn = compIn_;
      for (uint256 f = 0; f < prevUniswapPriceCumulatives_.length; f++) {
        amountIn = uniswapAmountOut(prevUniswapPriceCumulatives_[f], nowUniswapPriceCumulatives_[f], timeElapsed_, amountIn);
      }
      return amountIn;
    }

    function quoteSpotCompToUnderlying(
      uint256 compIn_
    ) public view returns (uint256) {
      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IUniswapAnchoredOracle oracle = IUniswapAnchoredOracle(IComptroller(cToken.comptroller()).oracle());
      return compIn_.mul(oracle.price("COMP")).div(oracle.getUnderlyingPrice(address(cToken)));
    }

    function uniswapAmountOut(
      uint256 prevPriceCumulative_, uint256 nowPriceCumulative_, uint256 timeElapsed_, uint256 amountIn_
    ) public pure returns (uint256) {
      // per: https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleSlidingWindowOracle.sol#L93
      FixedPoint.uq112x112 memory priceAverage = FixedPoint.uq112x112(
        uint224((nowPriceCumulative_ - prevPriceCumulative_) / timeElapsed_)
      );
      return FixedPoint.decode144(FixedPoint.mul(priceAverage, amountIn_));
    }

    function spotDailySupplyRate()
      public view returns (uint256)
    {
      // supplyRatePerBlock() * BLOCKS_PER_DAY
      return ICToken(CompoundProvider(pool).cToken()).supplyRatePerBlock().mul(BLOCKS_PER_DAY);
    }

    function spotDailyDistributionRate()
      public view returns (uint256)
    {
      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IComptroller comptroller = IComptroller(cToken.comptroller());
      IUniswapAnchoredOracle oracle = IUniswapAnchoredOracle(comptroller.oracle());

      // compSpeeds(cToken) * price("COMP") * BLOCKS_PER_DAY
      uint256 compDollarsPerDay = comptroller.compSpeeds(address(cToken)).mul(oracle.price("COMP")).mul(BLOCKS_PER_DAY);
      // (totalBorrows() + getCash()) * getUnderlyingPrice(cToken)
      uint256 totalSuppliedDollars = cToken.totalBorrows().add(cToken.getCash()).mul(oracle.getUnderlyingPrice(address(cToken)));
      // (compDollarsPerDay / totalSuppliedDollars)
      return compDollarsPerDay.div(totalSuppliedDollars);
    }

    function spotDailyRate()
      public view returns (uint256)
    {
      return spotDailySupplyRate().add(spotDailyDistributionRate());
    }
}
