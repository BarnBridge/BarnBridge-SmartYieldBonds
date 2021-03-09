// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../SmartYield.sol";

contract SmartYieldMock is SmartYield {

    constructor(uint8 underlyingDecimals_)
        SmartYield("bbDAI mock", "bbDAI", underlyingDecimals_)
    {}

    function juniorBondsMaturitiesAll() public view returns(uint256[] memory) {
      return juniorBondsMaturities;
    }
}
