// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IYieldOracle {
    function update() external;

    function consult(uint256 forInterval) external returns (uint256 amountOut);
}
