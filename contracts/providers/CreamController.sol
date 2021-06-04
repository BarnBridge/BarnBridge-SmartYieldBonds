// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/cream-finance/ICrCToken.sol";

import "./../IController.sol";
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";

import "./ICreamCumulator.sol";
import "./CreamProvider.sol";

contract CreamController is IController, ICreamCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    uint256 public constant MAX_UINT256 = uint256(-1);

    // claimed aave rewards are sent to this address
    address public rewardsCollector;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevExchnageRateCurrent;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    event Harvest(address indexed caller, uint256 rewardTotal, uint256 rewardSold, uint256 underlyingPoolShare, uint256 underlyingReward, uint256 harvestCost);

    modifier onlyPool {
      require(
        msg.sender == pool,
        "CrC: only pool"
      );
      _;
    }

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

    // claims and sells COMP on uniswap, returns total received comp and caller reward
    function harvest(uint256)
      public
    returns (uint256 rewardAmountGot, uint256 underlyingHarvestReward)
    {
        uint256 amountRewarded = CreamProvider(pool).claimRewardsTo(MAX_UINT256, rewardsCollector);

        emit Harvest(msg.sender, amountRewarded, 0, 0, 0, HARVEST_COST);
        return (amountRewarded, 0);
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
        return cumulativeSupplyRate;
      }

      uint256 cTokenBalance = CreamProvider(pool).cTokenBalance();
      updateCumulativesInternal(cTokenBalance, true);

      return cumulativeSupplyRate;
    }

    function updateCumulativesInternal(uint256, bool pingCompound_)
      private
    {
      uint256 timeElapsed = block.timestamp - prevCumulationTime;

      // only cumulate once per block
      if (0 == timeElapsed) {
        return;
      }

      ICrCToken cToken = ICrCToken(CreamProvider(pool).cToken());

      if (pingCompound_) {
        // exchangeRateStored will be up to date below
        cToken.accrueInterest();
      }

      uint256 exchangeRateStoredNow = cToken.exchangeRateStored();

      if (prevExchnageRateCurrent > 0) {
        // cumulate a new supplyRate delta: cumulativeSupplyRate += (cToken.exchangeRateCurrent() - prevExchnageRateCurrent) / prevExchnageRateCurrent
        // cumulativeSupplyRate eventually overflows, but that's ok due to the way it's used in the oracle
        cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchnageRateCurrent).mul(EXP_SCALE).div(prevExchnageRateCurrent);
      }

      prevCumulationTime = block.timestamp;

      // exchangeRateStored can increase multiple times per block
      prevExchnageRateCurrent = exchangeRateStoredNow;
    }

    // compound spot supply rate per day
    function spotDailySupplyRateProvider()
      public view returns (uint256)
    {
      // supplyRatePerBlock() * BLOCKS_PER_DAY
      return ICrCToken(CreamProvider(pool).cToken()).supplyRatePerBlock().mul(BLOCKS_PER_DAY);
    }

    // compound spot distribution rate per day
    function spotDailyDistributionRateProvider()
      public pure returns (uint256)
    {
      return 0;
    }

    // smart yield spot daily rate includes: spot supply + spot distribution
    function spotDailyRate()
      public view returns (uint256)
    {
      return spotDailySupplyRateProvider();
    }
}
