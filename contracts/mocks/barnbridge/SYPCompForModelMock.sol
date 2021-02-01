// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../model/IBondModel.sol";

contract SYPCompForModelMock is SmartYieldPoolCompound {
    uint256 public _currentTime = 0;
    uint256 public _underlyingLoanable = 0;
    uint256 public _underlyingTotal = 0;
    uint256 public _providerRatePerDay = 0;

    uint256 public _lastCheckGas = 0;

    constructor()
        SmartYieldPoolCompound()
    {}

    function currentTime() external view override returns (uint256) {
        return _currentTime;
    }

    function underlyingLoanable() external view override returns (uint256) {
      return _underlyingLoanable;
    }

    function underlyingTotal() external view override returns (uint256) {
      return _underlyingTotal;
    }

    function providerRatePerDay() external view override returns (uint256) {
      return _providerRatePerDay;
    }

    function checkGas(uint256 principal, uint16 forDays) external {
      _lastCheckGas = bondModel.gain(address(this), principal, forDays);
    }

    function setCurrentTime(uint256 currentTime_) external {
      _currentTime = currentTime_;
    }

    function setMockValues(uint256 underlyingLoanable_, uint256 underlyingTotal_, uint256 providerRatePerDay_) external {
      _underlyingLoanable = underlyingLoanable_;
      _underlyingTotal = underlyingTotal_;
      _providerRatePerDay = providerRatePerDay_;
    }


}