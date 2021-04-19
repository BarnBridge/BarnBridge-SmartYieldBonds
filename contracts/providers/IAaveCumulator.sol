// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IAaveCumulator {
  function _beforeCTokenBalanceChange() external;

  function _afterCTokenBalanceChange() external;
}
