// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "./IClockProvider.sol";

contract HasClock {

  address public clockProvider;

  constructor(address clockProvider_) {
    clockProvider = clockProvider_;
  }

  function clockCurrentTime() external view returns(uint256) {
    return IClockProvider(clockProvider).currentTime();
  }
}
