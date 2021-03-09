// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../uniswap/UniswapMock.sol";

import "./../../../providers/CompoundController.sol";

contract CompoundControllerHarvestMock is CompoundController {

  address public uniswapRouter_;

  constructor(
    address pool_,
    address smartYield_,
    address bondModel_,
    address[] memory uniswapPath_
  ) CompoundController(pool_, smartYield_, bondModel_, uniswapPath_) {
    uniswapRouter_ = address(new UniswapMock());
  }

  function uniswapRouter()
    public view override
    returns (address)
  {
    return uniswapRouter_ == address(0x0) ? 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D : uniswapRouter_;
  }

  function uniswapPriceCumulativesNow()
    public pure override returns (uint256[] memory)
  {
    // shortcut uniswapPriceCumulativesNow
    uint256[] memory newUniswapPriceCumulatives = new uint256[](0);
    return newUniswapPriceCumulatives;
  }
}
