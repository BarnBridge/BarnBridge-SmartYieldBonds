// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/aave/IAToken.sol";
import "./../external-interfaces/aave/ILendingPool.sol";

import "./AaveProvider.sol";

import "./../IController.sol";
import "./IAaveCumulator.sol";
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";

contract AaveController is IController, IAaveCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // claimed aave rewards are sent to this address
    address public rewardsCollector;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevExchnageRateCurrent;

    // cumulative supply rate += ((exchangeRate now - exchangeRate prev) * EXP_SCALE / exchangeRate now)
    uint256 public cumulativeSupplyRate;

    modifier onlyPool {
      require(
        msg.sender == pool,
        "AC: only pool"
      );
      _;
    }

    event Harvest(address indexed caller, uint256 rewardTotal, uint256 rewardSold, uint256 underlyingPoolShare, uint256 underlyingReward, uint256 harvestCost);

    constructor(
      address pool_,
      address smartYield_,
      address bondModel_,
      address rewardsCollector_
    )
      IController()
    {
      pool = pool_;
      smartYield = smartYield_;
      // 30% per year linear
      setBondMaxRatePerDay(821917808219178);
      setBondModel(bondModel_);
      setHarvestCost(0);
      setRewardsCollector(rewardsCollector_);
    }

    function setRewardsCollector(address newRewardsCollector_)
      public
      onlyDao
    {
      rewardsCollector = newRewardsCollector_;
    }

    // claims pool rewards and sends them to rewardsCollector
    function harvest(uint256)
      public
    returns (uint256 rewardAmountGot, uint256 underlyingHarvestReward)
    {

      address[] memory assets = new address[](1);
      assets[0] = AaveProvider(pool).cToken();

      uint256 amountRewarded = AaveProvider(pool).claimRewardsTo(assets, MAX_UINT256, rewardsCollector);

      emit Harvest(msg.sender, amountRewarded, 0, 0, 0, HARVEST_COST);

      return (amountRewarded, 0);
    }

    function _beforeCTokenBalanceChange()
      external override
      onlyPool
    { }

    function _afterCTokenBalanceChange()
      external override
      onlyPool
    {
      updateCumulativesInternal();
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
        return cumulativeSupplyRate;
      }

      updateCumulativesInternal();

      return cumulativeSupplyRate;
    }

    function updateCumulativesInternal()
      private
    {
      uint256 timeElapsed = block.timestamp - prevCumulationTime;

      if (0 == timeElapsed) {
        return;
      }

      ILendingPool lendingPool = ILendingPool(IAToken(AaveProvider(pool).cToken()).POOL());
      // https://docs.aave.com/developers/the-core-protocol/lendingpool#getreservenormalizedincome
      uint256 exchangeRateStoredNow = lendingPool.getReserveNormalizedIncome(AaveProvider(pool).uToken());

      if (prevExchnageRateCurrent > 0) {
        cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchnageRateCurrent).mul(EXP_SCALE).div(prevExchnageRateCurrent);
      }

      prevCumulationTime = block.timestamp;

      prevExchnageRateCurrent = exchangeRateStoredNow;
    }

    // aave spot supply rate per day
    function spotDailySupplyRateProvider()
      public view returns (uint256)
    {
      ILendingPool lendingPool = ILendingPool(IAToken(AaveProvider(pool).cToken()).POOL());
      ILendingPool.ReserveData memory lendingPoolData = lendingPool.getReserveData(AaveProvider(pool).uToken());
      // lendingPoolData.currentLiquidityRate is a rate per year in wad (1e27)
      // we need a daily rate with 1e18 precision
      return uint256(lendingPoolData.currentLiquidityRate).mul(1 days).div(SECONDS_PER_YEAR).div(1e9);
    }

    // aave spot reward rate per day
    function spotDailyDistributionRateProvider()
      public view returns (uint256)
    {
      // kept for backwards compat
      return 0;
    }

    // smart yield spot daily rate includes: spot supply
    function spotDailyRate()
      public view returns (uint256)
    {
      return spotDailySupplyRateProvider();
    }
}
