// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.6;

interface IIdleTokenHelper {
    function getRedeemPrice(address idleYieldToken, address user) external view returns (uint256);
    function getRedeemPrice(address idleYieldToken) external view returns (uint256);
    function getMintingPrice(address idleYieldToken) external view returns (uint256);
}
