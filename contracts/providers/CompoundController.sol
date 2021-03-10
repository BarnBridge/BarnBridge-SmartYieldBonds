// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
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
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";

contract CompoundController is IController, ICompoundCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant UNISWAP_ROUTER_V2 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant DOUBLE_SCALE = 1e36;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    uint256 public harvestedLast;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevExchnageRateCurrent;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    // cumulative COMP distribution rate += ((new underlying) / underlying)
    uint256 public cumulativeDistributionRate;

    // compound.finance comptroller.compSupplyState right after the previous deposit/withdraw
    IComptroller.CompMarketState public prevCompSupplyState;

    uint256 public underlyingDecimals;

    // uniswap path for COMP to underlying
    address[] public uniswapPath;

    // uniswap pairs for COMP to underlying
    address[] public uniswapPairs;

    // uniswap cumulative prices needed for COMP to underlying
    uint256[] public uniswapPriceCumulatives;

    // keys for uniswap cumulativePrice{0 | 1}
    uint8[] public uniswapPriceKeys;


    event Harvest(address indexed caller, uint256 compRewardTotal, uint256 compRewardSold, uint256 underlyingPoolShare, uint256 underlyingReward, uint256 harvestCost);


    modifier onlyPool {
      require(
        msg.sender == pool,
        "CC: only pool"
      );
      _;
    }

    constructor(
      address pool_,
      address smartYield_,
      address bondModel_,
      address[] memory uniswapPath_
    )
      IController()
    {
      pool = pool_;
      smartYield = smartYield_;
      underlyingDecimals = ERC20(ICToken(CompoundProvider(pool).cToken()).underlying()).decimals();
      setBondModel(bondModel_);
      setUniswapPath(uniswapPath_);

      updateAllowances();
    }

    function updateAllowances()
      public
    {

      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IComptroller comptroller = IComptroller(cToken.comptroller());
      IERC20 rewardToken = IERC20(comptroller.getCompAddress());
      IERC20 uToken = IERC20(CompoundProvider(pool).uToken());

      uint256 routerRewardAllowance = rewardToken.allowance(address(this), uniswapRouter());
      rewardToken.safeIncreaseAllowance(uniswapRouter(), MAX_UINT256.sub(routerRewardAllowance));

      uint256 poolUnderlyingAllowance = uToken.allowance(address(this), address(pool));
      uToken.safeIncreaseAllowance(address(pool), MAX_UINT256.sub(poolUnderlyingAllowance));
    }

    // should start with rewardCToken and with uToken, and have intermediary hops if needed
    // path[0] = address(rewardCToken);
    // path[1] = address(wethToken);
    // path[2] = address(uToken);
    function setUniswapPath(address[] memory newUniswapPath_)
      public virtual
      onlyDao
    {
        require(
          2 <= newUniswapPath_.length,
          "CC: setUniswapPath length"
        );

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

    function uniswapRouter()
      public view virtual returns(address)
    {
      // mockable
      return UNISWAP_ROUTER_V2;
    }

    // claims and sells COMP on uniswap, returns total received comp and caller reward
    function harvest(uint256 maxCompAmount_)
      public
    returns (uint256 compGot, uint256 underlyingHarvestReward)
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

        // claim pool comp
        address[] memory holders = new address[](1);
        holders[0] = pool;
        address[] memory markets = new address[](1);
        markets[0] = address(cToken);
        comptroller.claimComp(holders, markets, false, true);

        // transfer all comp from pool to self
        rewardToken.safeTransferFrom(pool, address(this), rewardToken.balanceOf(pool));
        uint256 compRewardTotal = rewardToken.balanceOf(address(this)); // COMP

        // only sell upmost maxCompAmount_, if maxCompAmount_ sell all
        maxCompAmount_ = (maxCompAmount_ == 0) ? compRewardTotal : maxCompAmount_;
        uint256 compRewardSold = MathUtils.min(maxCompAmount_, compRewardTotal);

        require(
          compRewardSold > 0,
          "PPC: harvested nothing"
        );

        // pool share is (comp to underlying) - (harvest cost percent)
        uint256 poolShare = MathUtils.fractionOf(
          quoteSpotCompToUnderlying(compRewardSold),
          EXP_SCALE.sub(HARVEST_COST)
        );

        // make sure we get at least the poolShare
        IUniswapV2Router(uniswapRouter()).swapExactTokensForTokens(
            compRewardSold,
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
        CompoundProvider(pool)._takeUnderlying(address(this), poolShare);
        CompoundProvider(pool)._depositProvider(poolShare, 0);

        // pay caller
        uint256 callerReward = uToken.balanceOf(address(this));
        uToken.safeTransfer(caller, callerReward);

        harvestedLast = block.timestamp;

        emit Harvest(caller, compRewardTotal, compRewardSold, poolShare, callerReward, HARVEST_COST);

        return (compRewardTotal, callerReward);
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
      IYieldOracle(oracle).update();
    }

    function providerRatePerDay()
      public override virtual
    returns (uint256)
    {
      return MathUtils.min(
        MathUtils.min(BOND_MAX_RATE_PER_DAY, spotDailyRate()),
        IYieldOracle(oracle).consult(1 days)
      );
    }

    function cumulatives()
      external override
      returns (uint256)
    {
      uint256 timeElapsed = block.timestamp - prevCumulationTime;

      // only cumulate once per block
      if (0 == timeElapsed) {
        return cumulativeSupplyRate.add(cumulativeDistributionRate);
      }

      uint256 cTokenBalance = CompoundProvider(pool).cTokenBalance();
      updateCumulativesInternal(cTokenBalance, true);

      return cumulativeSupplyRate.add(cumulativeDistributionRate);
    }

    function updateCumulativesInternal(uint256 prevCTokenBalance_, bool pingCompound_)
      private
    {
      uint256 timeElapsed = block.timestamp - prevCumulationTime;

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

      uint256 exchangeRateStoredNow = cToken.exchangeRateStored();
      (uint224 nowSupplyStateIndex, uint32 blk) = comptroller.compSupplyState(address(cToken));

      if (prevExchnageRateCurrent > 0) {
        // cumulate a new supplyRate delta: cumulativeSupplyRate += (cToken.exchangeRateCurrent() - prevExchnageRateCurrent) / prevExchnageRateCurrent
        // cumulativeSupplyRate eventually overflows, but that's ok due to the way it's used in the oracle
        cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchnageRateCurrent).mul(EXP_SCALE).div(prevExchnageRateCurrent);

        if (prevCTokenBalance_ > 0) {
          uint256 expectedComp = expectedDistributeSupplierComp(prevCTokenBalance_, nowSupplyStateIndex, prevCompSupplyState.index);
          uint256 expectedCompInUnderlying = quoteCompToUnderlying(
            expectedComp,
            timeElapsed,
            uniswapPriceCumulatives,
            currentUniswapPriceCumulatives
          );

          uint256 poolShare = MathUtils.fractionOf(expectedCompInUnderlying, EXP_SCALE.sub(HARVEST_COST));
          // cumulate a new distributionRate delta: cumulativeDistributionRate += (expectedDistributeSupplierComp in underlying - harvest cost) / prevUnderlyingBalance
          // cumulativeDistributionRate eventually overflows, but that's ok due to the way it's used in the oracle

          cumulativeDistributionRate += poolShare.mul(EXP_SCALE).div(cTokensToUnderlying(prevCTokenBalance_, prevExchnageRateCurrent));
        }
      }

      prevCumulationTime = block.timestamp;

      // uniswap cumulatives only change once per block
      uniswapPriceCumulatives = currentUniswapPriceCumulatives;

      // compSupplyState changes only once per block
      prevCompSupplyState = IComptroller.CompMarketState(nowSupplyStateIndex, blk);

      // exchangeRateStored can increase multiple times per block
      prevExchnageRateCurrent = exchangeRateStoredNow;
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
      public view virtual returns (uint256[] memory)
    {
      uint256[] memory newUniswapPriceCumulatives = new uint256[](uniswapPairs.length);
      for (uint256 f = 0; f < uniswapPairs.length; f++) {
        newUniswapPriceCumulatives[f] = uniswapPriceCumulativeNow(uniswapPairs[f], uniswapPriceKeys[f]);
      }
      return newUniswapPriceCumulatives;
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
    ) public view virtual returns (uint256) {

      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IUniswapAnchoredOracle compOracle = IUniswapAnchoredOracle(IComptroller(cToken.comptroller()).oracle());
      uint256 underlyingOut = compIn_.mul(compOracle.price("COMP")).mul(10**24).div(compOracle.getUnderlyingPrice(address(cToken))).div(10**(2 * underlyingDecimals));

      return underlyingOut;
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

    // compound spot supply rate per day
    function spotDailySupplyRateProvider()
      public view returns (uint256)
    {
      // supplyRatePerBlock() * BLOCKS_PER_DAY
      return ICToken(CompoundProvider(pool).cToken()).supplyRatePerBlock().mul(BLOCKS_PER_DAY);
    }

    // compound spot distribution rate per day
    function spotDailyDistributionRateProvider()
      public view returns (uint256)
    {
      ICToken cToken = ICToken(CompoundProvider(pool).cToken());
      IComptroller comptroller = IComptroller(cToken.comptroller());
      IUniswapAnchoredOracle compOracle = IUniswapAnchoredOracle(comptroller.oracle());

      // compSpeeds(cToken) * price("COMP") * BLOCKS_PER_DAY
      uint256 compDollarsPerDay = comptroller.compSpeeds(address(cToken)).mul(compOracle.price("COMP")).mul(BLOCKS_PER_DAY);

      // (totalBorrows() + getCash()) * getUnderlyingPrice(cToken)
      uint256 totalSuppliedDollars = cToken.totalBorrows().add(cToken.getCash()).mul(compOracle.getUnderlyingPrice(address(cToken)));

      // (compDollarsPerDay / totalSuppliedDollars)
      return compDollarsPerDay.mul(10**42).div(totalSuppliedDollars).div(10**(2 * underlyingDecimals));
    }

    // smart yield spot daily rate includes: spot supply + spot distribution
    function spotDailyRate()
      public view returns (uint256)
    {
      uint256 expectedSpotDailyDistributionRate = MathUtils.fractionOf(spotDailyDistributionRateProvider(), EXP_SCALE.sub(HARVEST_COST));
      // spotDailySupplyRateProvider() + (spotDailyDistributionRateProvider() - fraction lost to harvest)
      return spotDailySupplyRateProvider().add(expectedSpotDailyDistributionRate);
    }
}
