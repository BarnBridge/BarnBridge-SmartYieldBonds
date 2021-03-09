// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../lib/math/MathUtils.sol";
import "../../model/IBondModel.sol";

contract MathTests {

    uint256 public ratePerDay = 0;
    uint256 public compoundingTestLast = 0;

    function compoundingTest(
        uint256 principal_,
        uint256 ratePerDay_,
        uint16 forDays_
    ) external {
        compoundingTestLast = MathUtils.compound(principal_, ratePerDay_, forDays_) - principal_;
    }

    function compoundingTest2(
        uint256 principal_,
        uint256 ratePerDay_,
        uint16 forDays_
    ) external {
        compoundingTestLast = MathUtils.compound2(principal_, ratePerDay_, forDays_) - principal_;
    }
}
