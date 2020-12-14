// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface IBondModel {

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external view returns (uint256);

}
