// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "./IController.sol";

contract ControllerCompound is IController {

    // reward for calling harvest 3%
    uint256 public HARVEST_REWARD = 3 * 1e16; // 3%

    constructor() IController() { }

    function setHarvestReward(uint256 newValue_)
      public
      onlyDaoOrGuardian
    {
        HARVEST_REWARD = newValue_;
    }

}
