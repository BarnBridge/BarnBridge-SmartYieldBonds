// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../lib/math/MathUtils.sol";
import "./IBondModel.sol";
import "../ISmartYield.sol";

contract BondModelV1 is IBondModel {
    using SafeMath for uint256;

    function gain(
        address pool_,
        uint256 principal_,
        uint16 forDays_
    )
      external view override
    returns (uint256)
    {
        uint256 loanable = ISmartYield(pool_).underlyingLoanable();
        uint256 total = ISmartYield(pool_).underlyingTotal();
        uint256 dailyRate = ISmartYield(pool_).providerRatePerDay();

        uint256 aproxGain = MathUtils.compound2(
          principal_,
          //dailyRate * (loanable * 1e18 / (total + principal)) / 1e18,
          uint256(1e18).mul(dailyRate).mul(loanable) / (total + principal_) / 1e18,
          forDays_
        ).sub(principal_);

        uint256 rate = uint256(1e18).mul(dailyRate).mul(loanable.sub(aproxGain, "BondModelV1: liquidity")) / (total + principal_) / 1e18;

        return MathUtils.compound2(principal_, rate, forDays_).sub(principal_);
    }

    function maxDailyRate(
      address pool_
    )
      external view override
    returns (uint256)
    {
      uint256 total = ISmartYield(pool_).underlyingTotal();
      if (0 == total) {
        return 0;
      }

      uint256 loanable = ISmartYield(pool_).underlyingLoanable();
      uint256 dailyRate = ISmartYield(pool_).providerRatePerDay();
      return uint256(1e18).mul(dailyRate).mul(loanable) / (total) / 1e18;
    }

}
