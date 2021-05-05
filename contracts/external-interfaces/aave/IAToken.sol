// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IAToken {
  function UNDERLYING_ASSET_ADDRESS() external view returns (address);
  function getIncentivesController() external view returns (address);
  function POOL() external view returns (address);
  function balanceOf(address user) external view returns (uint256);
}
