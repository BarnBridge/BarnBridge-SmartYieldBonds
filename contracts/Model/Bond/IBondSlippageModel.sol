// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface IBondSlippageModel {

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external view returns (uint256);

}
