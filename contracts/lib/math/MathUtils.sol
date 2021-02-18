// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";

library MathUtils {

    using SafeMath for uint256;

    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x < y ? x : y;
    }

    function max(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x > y ? x : y;
    }

    function compound(
        // in wei
        uint256 principal,
        // rate is * 1e18
        uint256 ratePerPeriod,
        uint16 periods
    ) internal pure returns (uint256) {
        while (periods > 0) {
            // principal += principal * ratePerPeriod / 1e18;
            principal = principal.add(principal.mul(ratePerPeriod).div(1e18));
            periods -= 1;
        }
        return principal;
    }

    function compound2(
      uint256 principal,
      uint256 ratePerPeriod,
      uint16 periods
    ) internal pure returns (uint256) {
      while (periods > 0) {
        if (periods % 2 == 1) {
          //principal += principal * ratePerPeriod / 1e18;
          principal = principal.add(principal.mul(ratePerPeriod).div(1e18));
          periods -= 1;
        } else {
          //ratePerPeriod = ((2 * ratePerPeriod * 1e18) + (ratePerPeriod * ratePerPeriod)) / 1e18;
          ratePerPeriod = ((uint256(2).mul(ratePerPeriod).mul(1e18)).add(ratePerPeriod.mul(ratePerPeriod))).div(1e18);
          periods /= 2;
        }
      }
      return principal;
    }

    // computes a * f / 1e18
    function fractionOf(uint256 a, uint256 f) internal pure returns (uint256) {
      return a.mul(f).div(1e18);
    }

}
