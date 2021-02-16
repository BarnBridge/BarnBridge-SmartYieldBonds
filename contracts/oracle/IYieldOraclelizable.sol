// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IYieldOraclelizable {
    // returns cumulatives and accumulates/updates internal state
    // oracle should call this when updating
    function cumulatives()
      external
    returns(uint256 cumulativeSecondlyYield, uint256 cumulativeCtokenBalance);

    // returns cumulative yield up to currentTime()
    function currentCumulatives()
      external view
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeCtokenBalance);

    // needs to return block.timestamp, otherwise used for mocks
    function currentTime() external view returns (uint256);
}
