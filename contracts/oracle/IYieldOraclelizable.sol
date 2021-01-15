// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IYieldOraclelizable {
    // returns cumulative yield up to currentTime()
    function currentCumulativeSecondlyYield()
        external
        view
        returns (uint256 cumulativeYield, uint256 blockTimestamp);

    // is it safe to call currentCumulativeSecondlyYield()
    function safeToObserve() external view returns (bool);

    // needs to return block.timestamp, otherwise used for mocks
    function currentTime() external view returns (uint256);
}
