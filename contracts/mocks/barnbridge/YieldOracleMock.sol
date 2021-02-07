// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../oracle/YieldOracle.sol";

contract YieldOracleMock is YieldOracle {
    uint256 public yieldPerDay;
    address public updatedBy;

    constructor() YieldOracle(address(0), (3 days), 6) {}

    function consult(uint256 forInterval)
        external view override
        returns (uint256 amountOut)
    {
        return (yieldPerDay * forInterval) / (1 days);
    }

    function update()
      external override
    {
      updatedBy = msg.sender;
    }

    function setYieldPerDay(uint256 yieldPerDay_) external {
        yieldPerDay = yieldPerDay_;
    }
}
