// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface ISignedYieldOraclelizable {
    // accumulates/updates internal state and returns cumulatives
    // oracle should call this when updating
    function cumulatives() external returns (int256 cumulativeYield);
}
