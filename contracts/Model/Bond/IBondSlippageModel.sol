// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface IBondSlippageModel {

    function slippage(
      uint256 principal,
      uint256 ratePerBlock,
      uint256 seniorTotal,
      uint256 juniorTotal,
      uint16 forDays
    ) external view returns (uint256);

}
