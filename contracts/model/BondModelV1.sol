// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../lib/math/MathUtils.sol";
import "./IBondModel.sol";

contract BondModelV1 is IBondModel {
    using SafeMath for uint256;

    function gain(
        uint256 total_,
        uint256 loanable_,
        uint256 dailyRate_,
        uint256 principal_,
        uint16 forDays_
    )
      external pure override
    returns (uint256)
    {
        if (0 == total_) {
          return 0;
        }

        uint256 aproxGain = MathUtils.compound2(
          principal_,
          //dailyRate * (loanable / (total + principal)),
          dailyRate_.mul(loanable_).div(total_.add(principal_)),
          forDays_
        ).sub(principal_);

        uint256 rate = dailyRate_.mul(loanable_.sub(aproxGain, "BondModelV1: liquidity")).div(total_.add(principal_));

        return MathUtils.compound2(principal_, rate, forDays_).sub(principal_);
    }

    function maxDailyRate(
      uint256 total_,
      uint256 loanable_,
      uint256 dailyRate_
    )
      external pure override
    returns (uint256)
    {
      if (0 == total_) {
        return 0;
      }
      return dailyRate_.mul(loanable_).div(total_);
    }

}
