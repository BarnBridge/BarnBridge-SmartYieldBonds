// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../oracle/IYieldOracle.sol";

contract OraclelizedMock is SmartYieldPoolCompound {
    uint256 public _underlyingTotal;
    uint256 public _now;

    constructor()
        SmartYieldPoolCompound()
    { }

    function cumulate() external accountYield {}

    function underlyingTotal() external view override returns (uint256) {
        return _underlyingTotal;
    }

    function setUnderlyingAndCumulate(uint256 underlyingTotal_) external {
        this.setUnderlyingTotal(underlyingTotal_);
        this.cumulate();
        IYieldOracle(oracle).update();
    }

    function setUnderlyingTotal(uint256 underlyingTotal_) external {
        _underlyingTotal = underlyingTotal_;
    }

    function setUnderlyingTotal(uint256 underlyingTotal_, uint256 underlyingTotalLast_) external {
        _underlyingTotal = underlyingTotal_;
        underlyingTotalLast = underlyingTotalLast_;
    }

    function setCurrentTime(uint256 now_) external {
        _now = now_;
    }

    function currentTime() external view override returns (uint256) {
        return _now;
    }

    function setCumulativeSecondlyYieldLast(uint256 cumulativeSecondlyYieldLast_, uint256 timestampLast_) external {
        cumulativeSecondlyYieldLast = cumulativeSecondlyYieldLast_;
        timestampLast = uint32(timestampLast_ % 2**32);
    }

    function setSafeToObserve(bool safeToObserve_) external {
      _safeToObserve = safeToObserve_;
    }

    function cumulativeOverflowProof(uint256 diff)
        external
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
