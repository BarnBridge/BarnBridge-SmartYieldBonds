// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./../IController.sol";

contract CompoundController is IController {

    // reward for calling harvest 3%
    uint256 public HARVEST_REWARD = 3 * 1e16; // 3%

    address public uniswap;

    address[] public uniswapPath;

    constructor(
      address uniswap_,
      address[] memory uniswapPath_
    ) IController() {
      setUniswap(uniswap_);
      setUniswapPath(uniswapPath_);
    }

    function setHarvestReward(uint256 newValue_)
      public
      onlyDaoOrGuardian
    {
        HARVEST_REWARD = newValue_;
    }

    function setUniswap(address newValue_)
      public
      onlyDaoOrGuardian
    {
        uniswap = newValue_;
    }

    // should start with rewardCToken and with uToken, and have intermediary hops if needed
    // path[0] = address(rewardCToken);
    // path[1] = address(wethToken);
    // path[2] = address(uToken);
    function setUniswapPath(address[] memory newValue_)
      public
      onlyDaoOrGuardian
    {
        uniswapPath = newValue_;
    }

    function getUniswapPath()
      public view
    returns (address[] memory)
    {
      return uniswapPath;
    }
}
