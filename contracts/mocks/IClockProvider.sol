// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

interface IClockProvider {
  function currentTime() external view returns(uint256);
}
