// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "../../lib/math/MathUtils.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../model/IBondModel.sol";

contract BondModelMock is IBondModel {

    uint256 public ratePerDay = 0;
    uint256 public compoundingTestLast = 0;

    function gain(
        address,
        uint256 principal,
        uint16 forDays
    ) external view override returns (uint256) {
        return MathUtils.compound(principal, ratePerDay, forDays) - principal;
    }

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

    function setRatePerDay(uint256 ratePerDay_) external {
        ratePerDay = ratePerDay_;
    }
}
