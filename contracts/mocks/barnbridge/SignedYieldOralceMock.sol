// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../oracle/SignedYieldOracle.sol";

/*
 Mock timestamp
*/
contract SignedYieldOracleMock is SignedYieldOracle {
    uint256 public _timestamp;

    constructor(
        address cumulator_,
        uint256 windowSize_,
        uint8 granularity_
    ) SignedYieldOracle(cumulator_, windowSize_, granularity_) {}

    function setTimestamp(uint256 timestamp_) public {
        _timestamp = timestamp_;
    }

    function getTimestamp() public view virtual override returns (uint256) {
        return _timestamp;
    }
}
