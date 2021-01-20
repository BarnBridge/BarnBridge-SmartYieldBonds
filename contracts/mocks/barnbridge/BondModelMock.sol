// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../lib/math/Math.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../model/IBondModel.sol";

contract BondModelMock is IBondModel {
    using Math for uint256;

    uint256 public ratePerDay = 0;
    uint256 public compoundingTestLast = 0;

    function gain(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external view override returns (uint256) {
        return Math.compound(principal, ratePerDay, forDays) - principal;
    }

    function compoundingTest(
        uint256 principal_,
        uint256 ratePerDay_,
        uint16 forDays_
    ) external {
        compoundingTestLast = Math.compound(principal_, ratePerDay_, forDays_) - principal_;
    }

    function setRatePerDay(uint256 ratePerDay_) external {
        ratePerDay = ratePerDay_;
    }
}
