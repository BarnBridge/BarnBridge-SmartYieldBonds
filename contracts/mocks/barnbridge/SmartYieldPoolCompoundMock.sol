// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "../../SmartYieldPoolCompound.sol";

contract SmartYieldPoolCompoundMock is SmartYieldPoolCompound {
    uint256 public _currentTime = 0;

    constructor()
        SmartYieldPoolCompound()
    {}

    function currentTime() public view virtual override returns (uint256) {
        return _currentTime;
    }

    function setCurrentTime(uint256 ts) public {
        _currentTime = ts;
    }
}
