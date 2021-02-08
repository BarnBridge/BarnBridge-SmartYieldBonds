// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./CompoundProviderMock.sol";

contract CompoundProviderMockCompRewardExpected is CompoundProviderMock {

    uint256 public _compRewardExpected;

    constructor(address clockProvider_)
      CompoundProviderMock(clockProvider_)
    { }

    function compRewardExpected()
      public view override
      returns (uint256)
    {
        return _compRewardExpected;
    }

    function setCompRewardExpected(uint256 compRewardExpected_)
      public
    {
      _compRewardExpected = compRewardExpected_;
    }

}
