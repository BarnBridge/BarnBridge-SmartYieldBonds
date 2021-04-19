// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../lib/math/MathUtils.sol";

import "./ABondModelV2.sol";

contract BondModelV2Linear is ABondModelV2
{
    using SafeMath for uint256;

    function gain(
        uint256 total_,
        uint256 loanable_,
        uint256 dailyRate_,
        uint256 principal_,
        uint16 forDays_
    )
      public view override
    returns (uint256)
    {
        if (0 == total_.add(principal_)) {
          return 0;
        }

        uint256 dailyRateAprox = slippedDailyRate(dailyRate_, total_, loanable_, principal_, 0);

        uint256 aproxGain = MathUtils.linearGain(
          principal_,
          dailyRateAprox,
          forDays_
        ).sub(principal_);

        uint256 rate = slippedDailyRate(dailyRate_, total_, loanable_, principal_, aproxGain);

        return MathUtils.linearGain(principal_, rate, forDays_).sub(principal_);
    }

}
