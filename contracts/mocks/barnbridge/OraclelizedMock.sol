// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "hardhat/console.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../oracle/IYieldOracle.sol";

contract OraclelizedMock is SmartYieldPoolCompound {
    uint256 public _underlyingTotal;
    uint256 public _now;

    constructor()
        SmartYieldPoolCompound()
    { }

    function cumulate() public accountYield {}

    function underlyingTotal() public view override returns (uint256) {
        return _underlyingTotal;
    }

    function setUnderlyingAndCumulate(uint256 underlyingTotal_) public {
        this.setUnderlyingTotal(underlyingTotal_);
        this.cumulate();
        IYieldOracle(ControllerCompound(controller).oracle()).update();
    }

    function setUnderlyingTotal(uint256 underlyingTotal_) public {
        _underlyingTotal = underlyingTotal_;
    }

    function setUnderlyingTotal(uint256 underlyingTotal_, uint256 underlyingTotalLast_) public {
        _underlyingTotal = underlyingTotal_;
        st.underlyingTotalLast = underlyingTotalLast_;
    }

    function setCurrentTime(uint256 now_) public {
        _now = now_;
    }

    function currentTime() public view override returns (uint256) {
        return _now;
    }

    function cumulativeSecondlyYieldLast() public view returns(uint256) {
      return st.cumulativeSecondlyYieldLast;
    }

    function setCumulativeSecondlyYieldLast(uint256 cumulativeSecondlyYieldLast_, uint256 timestampLast_) public {
        st.cumulativeSecondlyYieldLast = cumulativeSecondlyYieldLast_;
        st.timestampLast = uint32(timestampLast_ % 2**32);
    }

    function setSafeToObserve(bool safeToObserve_) public {
      _safeToObserve = safeToObserve_;
    }

    function cumulativeOverflowProof(uint256 diff)
        public
        pure
        returns (uint256)
    {
        uint256 cumulativeLast = uint256(-1); // MAX_UINT256
        uint256 cumulativeNow = cumulativeLast + diff; // overflows
        require(
            diff == cumulativeNow - cumulativeLast,
            "OVERFLOW_ASSUMPTION_FAILED"
        );
        return (cumulativeNow - cumulativeLast);
    }
}
