// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../SmartYield.sol";

contract SmartYieldPoolCompoundMock is SmartYield {
    uint256 public _currentTime = 0;

    constructor()
        SmartYield("bbDAI mock", "bbDAI")
    {}

    function currentTime() public view virtual override returns (uint256) {
        return _currentTime;
    }

    function setCurrentTime(uint256 ts) external {
        _currentTime = ts;
    }
}
