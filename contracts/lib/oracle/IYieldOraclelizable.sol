// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IYieldOraclelizable {
      function currentCumulativeSecondlyYield() external view returns (uint256 cumulativeYield, uint256 blockNumber);
      function safeToObserve() external view returns (bool);
}
