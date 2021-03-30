// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface ISignedYieldOracle {
    function update() external;

    function isAvailabe() external view returns (bool);

    function consultSigned(uint256 forInterval)
        external
        returns (int256 amountOut);
}
