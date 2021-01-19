// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../oracle/IYieldOracle.sol";

contract YieldOracleMock is IYieldOracle {
    uint256 public updateCalledTimes = 0;
    uint256 yieldPerDay = 0;

    function update() external override {
        updateCalledTimes++;
    }

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
