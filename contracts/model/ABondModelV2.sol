// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../lib/math/MathUtils.sol";

import "../Governed.sol";

abstract contract ABondModelV2 is Governed
{
    using SafeMath for uint256;

    uint256 public constant EXP_SCALE = 1e18;

    uint256 public MAX_POOL_RATIO = 750 * 1e15; // 75%

    function gain(uint256 total_, uint256 loanable_, uint256 dailyRate_, uint256 principal_, uint16 forDays_) external view virtual returns (uint256);

    function setMaxPoolRatio(uint256 newMaxPoolRatio_)
      public
      onlyDao
    {
      MAX_POOL_RATIO = newMaxPoolRatio_;
    }

    function maxDailyRate(
      uint256 total_,
      uint256 loanable_,
      uint256 dailyRate_
    )
      public view
    returns (uint256)
    {
      if (0 == total_) {
        return 0;
      }

      return slippedDailyRate(dailyRate_, total_, loanable_, 0, 0);
    }

    function slippedDailyRate(
        uint256 dailyRate_,
        uint256 total_,
        uint256 loanable_,
        uint256 principal_,
        uint256 aproxGain_
    )
      public view
    returns (uint256)
    {
      if (0 == total_.add(principal_)) {
        return 0;
      }

      // ((loanable - aproxGain) / (total + principal)),
      uint256 ratio = (loanable_.sub(aproxGain_, "BondModelV2: liquidity")).mul(EXP_SCALE).div(total_.add(principal_));

      return MathUtils.fractionOf(
        dailyRate_,
        MathUtils.min(ratio, MAX_POOL_RATIO)
      );
    }

}
