// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

interface IUniswapAnchoredOracle {
  function price(string memory symbol) external view returns (uint256);
  function getUnderlyingPrice(address cToken) external view returns (uint256);
}
