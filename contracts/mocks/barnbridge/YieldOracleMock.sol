// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "../../oracle/YieldOracle.sol";

contract YieldOracleMock is YieldOracle {
    uint256 public yieldPerDay = 0;

    constructor(address pool_) YieldOracle(pool_, (3 days), 6) {}

    function consult(uint256 forInterval)
        external
        view
        override
        returns (uint256 amountOut)
    {
        return (yieldPerDay * forInterval) / (1 days);
    }

    function setYieldPerDay(uint256 yieldPerDay_) external {
        yieldPerDay = yieldPerDay_;
    }
}
