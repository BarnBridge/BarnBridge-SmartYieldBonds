// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/aave/AToken.sol";
import "./../external-interfaces/aave/ILendingPool.sol";

import "./AaveProvider.sol";

import "./../IController.sol";
import "./ICompoundCumulator.sol";
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";

contract AaveController is IController, ICompoundCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchnageRateStored last time we cumulated
    uint256 public prevExchnageRateCurrent;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    modifier onlyPool {
      require(
        msg.sender == pool,
        "AC: only pool"
      );
      _;
    }

    constructor(
      address pool_,
      address smartYield_,
      address bondModel_
      //address[] memory uniswapPath_
    )
      IController()
    {
      pool = pool_;
      smartYield = smartYield_;
      setBondModel(bondModel_);
    }

    function _beforeCTokenBalanceChange()
      external override
      onlyPool
    { }

    function _afterCTokenBalanceChange(uint256 prevCTokenBalance_)
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

      ILendingPool lendingPool = ILendingPool(AToken(AaveProvider(pool).cToken()).POOL());
      uint256 exchangeRateStoredNow = lendingPool.getReserveNormalizedIncome(AaveProvider(pool).uToken());

      if (prevExchnageRateCurrent > 0) {
        cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchnageRateCurrent).mul(EXP_SCALE).div(prevExchnageRateCurrent);
      }

      prevCumulationTime = block.timestamp;

      prevExchnageRateCurrent = exchangeRateStoredNow;
    }

    function cTokensToUnderlying(
      uint256 cTokens_, uint256 exchangeRate_
    ) public pure returns (uint256) {
      return cTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

    // aave spot supply rate per day
    function spotDailySupplyRateProvider()
      public view returns (uint256)
    {
      ILendingPool lendingPool = ILendingPool(AToken(AaveProvider(pool).cToken()).POOL());
      ILendingPool.ReserveData memory lendingPoolData = lendingPool.getReserveData(AaveProvider(pool).uToken());
      return uint256(lendingPoolData.currentLiquidityRate).mul(1 days).div(SECONDS_PER_YEAR);
    }

    // smart yield spot daily rate includes: spot supply
    function spotDailyRate()
      public view returns (uint256)
    {
      return spotDailySupplyRateProvider();
    }
}