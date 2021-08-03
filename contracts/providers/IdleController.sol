// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./../lib/math/MathUtils.sol";
import "./../external-interfaces/idle/IIdleToken.sol";
import "./IIdleCumulator.sol";
import "../IController.sol";
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";
import "./IdleProvider.sol";

contract IdleController is IController, IIdleCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_UINT256 = uint256(-1);
    address public uToken;
    address public cToken;
    address public rewardsCollector;
    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchangeRateStored last time we cumulated
    uint256 public prevExchangeRateCurrent;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    uint256 public underlyingDecimals;

    event Harvest(address indexed caller, address[] token, uint256[] rewardTotal, uint256[] rewardSold, uint256 underlyingReward, uint256 harvestCost);

    modifier onlyPool {
      require(
        msg.sender == pool,
        "IC: only pool"
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
      rewardsCollector = rewardsCollector_;
      uToken = IdleProvider(pool).uToken();
      cToken = IdleProvider(pool).cToken();
      underlyingDecimals = ERC20(uToken).decimals();
      setBondModel(bondModel_);
    }

    function _beforeCTokenBalanceChange() external override onlyPool {}

    function _afterCTokenBalanceChange(uint256 prevCTokenBalance_) external override onlyPool {
        updateCumulativesInternal(prevCTokenBalance_, false);
        IYieldOracle(oracle).update();
    }

    function updateCumulativesInternal(uint256 val, bool pingIdle_) internal {
        uint256 timeElapsed = block.timestamp - prevCumulationTime;

        // only cumulate once per block
        if (0 == timeElapsed) {
            return;
        }

        uint256 exchangeRateStoredNow = IIdleToken(cToken).tokenPriceWithFee(address(pool));

        if (prevExchangeRateCurrent > 0) {
          // cumulate a new supplyRate delta: cumulativeSupplyRate += (cToken.exchangeRateCurrent() - prevExchnageRateCurrent) / prevExchnageRateCurrent
          // cumulativeSupplyRate eventually overflows, but that's ok due to the way it's used in the oracle
          cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchangeRateCurrent).mul(EXP_SCALE).div(prevExchangeRateCurrent);
        }

        prevCumulationTime = block.timestamp;

        // exchangeRateStored can increase multiple times per block
        prevExchangeRateCurrent = exchangeRateStoredNow;
    }

    function providerRatePerDay() public override returns (uint256) {
        return MathUtils.min(
            MathUtils.min(BOND_MAX_RATE_PER_DAY, spotDailyRate()),
            IYieldOracle(oracle).consult(1 days)
        );
    }

    function cumulatives() public override returns (uint256) {
        uint256 timeElapsed = block.timestamp - prevCumulationTime;
        // only cumulate once per block
        if (0 == timeElapsed) {
          return cumulativeSupplyRate;
        }
        uint256 cTokenBalance = IdleProvider(pool).cTokenBalance();
        updateCumulativesInternal(cTokenBalance, false);
        return cumulativeSupplyRate;
    }

    function cTokensToUnderlying(uint256 cTokens_, uint256 exchangeRate_) public pure returns (uint256) {
      return cTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

    function harvest(uint256)
      public
      returns (address[] memory tokens, uint256[] memory rewardAmounts, uint256 underlyingHarvestReward)
    {
        (address[] memory tokens, uint256[] memory rewardTotal, uint256[] memory rewardSold)
          = IdleProvider(pool).claimRewardsTo(MAX_UINT256, rewardsCollector);
        emit Harvest(msg.sender, tokens, rewardTotal, rewardSold, 0, HARVEST_COST);
        return (tokens, rewardTotal, 0);
    }

    function spotDailySupplyRateProvider() public view returns (uint256) {
        // eg. [5000, 0, 5000, 0] for 50% in compound, 0% fulcrum, 50% aave, 0 dydx. same order of allAvailableTokens
        uint256 apr = 0;
        uint256[] memory allocations = IIdleToken(cToken).getAllocations();
        (address[] memory addresses, uint256[] memory aprs) = IIdleToken(cToken).getAPRs();
        for (uint256 i = 0; i<allocations.length; i++) {
            apr = apr.add(allocations[i].mul(aprs[i]));
        }
        return apr.div(36500).div(10000);
    }

    function spotDailyDistributionRateProvider() public view returns (uint256) {
        return 0;
    }

    function spotDailyRate() public view returns (uint256) {
        return spotDailySupplyRateProvider();
    }

}
