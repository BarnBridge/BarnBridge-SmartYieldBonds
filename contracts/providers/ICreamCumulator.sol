// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface ICreamCumulator {
  function _beforeCTokenBalanceChange() external;

  function _afterCTokenBalanceChange(uint256 prevCTokenBalance_) external;
}
