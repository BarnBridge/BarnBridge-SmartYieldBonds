// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IYieldOraclelizable {
    // returns cumulative yield up to currentTime()
    function currentCumulatives()
        external
        view
        returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingTotal, uint256 blockTs);

    // is it safe to call currentCumulativeSecondlyYield()
    function safeToObserve() external view returns (bool);

    // needs to return block.timestamp, otherwise used for mocks
    function currentTime() external view returns (uint256);
}
