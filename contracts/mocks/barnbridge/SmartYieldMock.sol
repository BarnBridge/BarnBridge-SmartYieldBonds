// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../HasClock.sol";

import "../../SmartYield.sol";

contract SmartYieldMock is HasClock, SmartYield {

    constructor(address clockProvider_)
        HasClock(clockProvider_)
        SmartYield("bbDAI mock", "bbDAI")
    {}

    function currentTime() public view virtual override returns (uint256) {
        return this.clockCurrentTime();
    }
}
