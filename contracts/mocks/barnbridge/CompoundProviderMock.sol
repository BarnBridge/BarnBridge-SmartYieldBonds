// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../HasClock.sol";

import "../../providers/CompoundProvider.sol";

contract CompoundProviderMock is HasClock, CompoundProvider {

    constructor(address clockProvider_)
        HasClock(clockProvider_)
    {}

    function currentTime() public view virtual override returns (uint256) {
        return this.clockCurrentTime();
    }

    function setInputsTransferFees(uint256 cTokenBalance_, uint256 underlyingFees_) external {
      cTokenBalance = cTokenBalance_;
      underlyingFees = underlyingFees_;
    }
}
