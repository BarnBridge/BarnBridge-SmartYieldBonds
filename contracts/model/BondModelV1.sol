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
        uint256 aproxGain = MathUtils.compound2(
          principal_,
          //dailyRate * (loanable * 1e18 / (total + principal)) / 1e18,
          uint256(1e18).mul(dailyRate_).mul(loanable_) / (total_ + principal_) / 1e18,
          forDays_
        ).sub(principal_);

        uint256 rate = uint256(1e18).mul(dailyRate_).mul(loanable_.sub(aproxGain, "BondModelV1: liquidity")) / (total_ + principal_) / 1e18;

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
      return uint256(1e18).mul(dailyRate_).mul(loanable_) / (total_) / 1e18;
    }

}
