// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../providers/CompoundProviderPool.sol";
import "../../oracle/IYieldOracle.sol";

contract OraclelizedMock is CompoundProviderPool {
    uint256 public _underlyingBalance;
    uint256 public _now;

    constructor()
    { }

    function cumulate() public {
      this.cumulatives();
    }

    function underlyingBalance() public view override returns (uint256) {
        return _underlyingBalance;
    }

    function setUnderlyingBalanceAndCumulate(uint256 underlyingBalance_) public {
        this.setUnderlyingBalance(underlyingBalance_);
        this.cumulate();
        IYieldOracle(CompoundController(controller).oracle()).update();
    }

    function setUnderlyingBalance(uint256 underlyingBalance_) public {
        _underlyingBalance = underlyingBalance_;
    }

    function setUnderlyingBalance(uint256 underlyingBalance_, uint256 underlyingBalanceLast_) public {
        _underlyingBalance = underlyingBalance_;
        underlyingBalanceLast = underlyingBalanceLast_;
    }

    function setCurrentTime(uint256 now_) public {
        _now = now_;
    }

    function currentTime() public view override returns (uint256) {
        return _now;
    }

    function setCumulativeSecondlyYieldLast(uint256 cumulativeSecondlyYieldLast_, uint256 timestampLast_) public {
        cumulativeSecondlyYieldLast = cumulativeSecondlyYieldLast_;
        cumulativeTimestampLast = uint32(timestampLast_ % 2**32);
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
