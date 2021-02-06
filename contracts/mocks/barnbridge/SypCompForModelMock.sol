// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../SmartYield.sol";
import "../../model/IBondModel.sol";

contract SypCompForModelMock is SmartYield {
    uint256 public _currentTime = 0;
    uint256 public _underlyingLoanable = 0;
    uint256 public _underlyingTotal = 0;
    uint256 public _providerRatePerDay = 0;

    uint256 public _lastCheckGas = 0;

    constructor()
        SmartYield("bbDAI mock", "bbDAI")
    {}

    function currentTime() public view override returns (uint256) {
        return _currentTime;
    }

    function underlyingLoanable() public view override returns (uint256) {
      return _underlyingLoanable;
    }

    function underlyingTotal() public view override returns (uint256) {
      return _underlyingTotal;
    }

    function providerRatePerDay() public view override returns (uint256) {
      return _providerRatePerDay;
    }

    function checkGas(uint256 principal, uint16 forDays) public {
      _lastCheckGas = IBondModel(IController(controller).bondModel()).gain(address(this), principal, forDays);
    }

    function setCurrentTime(uint256 currentTime_) public {
      _currentTime = currentTime_;
    }

    function setMockValues(uint256 underlyingLoanable_, uint256 underlyingTotal_, uint256 providerRatePerDay_) public {
      _underlyingLoanable = underlyingLoanable_;
      _underlyingTotal = underlyingTotal_;
      _providerRatePerDay = providerRatePerDay_;
    }
}