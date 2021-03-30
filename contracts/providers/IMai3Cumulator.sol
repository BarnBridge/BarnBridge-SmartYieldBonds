// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IMai3Cumulator {
    function _beforeShareTokenBalanceChange() external;

    function _afterShareTokenBalanceChange(uint256 prevShareTokenBalance_) external;
}
