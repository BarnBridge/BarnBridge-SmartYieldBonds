// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "./IClockProvider.sol";

contract ClockMock is IClockProvider {

  uint256 public _now;

  function currentTime() external view override returns(uint256) {
    return _now;
  }

  function setCurrentTime(uint256 now_) external {
    _now = now_;
  }

}
