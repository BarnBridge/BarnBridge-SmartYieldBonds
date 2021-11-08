// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IEpochAdvancer {
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view returns (bool, bytes memory);

    function performUpkeep(
        bytes calldata /* performData */
    ) external;
}
