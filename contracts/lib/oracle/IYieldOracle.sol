// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IYieldOracle {
    function update() external;

    function consult() external view returns (uint256 amountOut);
}
