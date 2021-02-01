// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../SmartYieldPoolCompound.sol";

contract SmartYieldPoolCompoundMock is SmartYieldPoolCompound {
    uint256 public _currentTime = 0;

    constructor()
        SmartYieldPoolCompound()
    {}

    function currentTime() external view virtual override returns (uint256) {
        return _currentTime;
    }

    function setCurrentTime(uint256 ts) external {
        _currentTime = ts;
    }
}
