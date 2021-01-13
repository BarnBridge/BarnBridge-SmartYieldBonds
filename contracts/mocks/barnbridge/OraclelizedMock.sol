// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../SmartYieldPoolCompound.sol";
import "../../lib/oracle/IYieldOracle.sol";

contract OraclelizedMock is SmartYieldPoolCompound {
    uint256 public _underlyingTotal;
    uint256 public _underlyingDecimals;

    uint256 public _now;

    address public oracle;

    constructor(uint256 underlyingDecimals_)
        SmartYieldPoolCompound("BB DAI MOCK", "bbDAIMOCK")
    {
        _underlyingDecimals = underlyingDecimals_;
    }

    function underlyingDecimals() external view override returns (uint256) {
        return _underlyingDecimals;
    }

    /*function currentCumulativeSecondlyYield()
        external
        view
        override
        returns (uint256 cumulativeYield, uint256 blockTs)
    {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        uint256 cumulativeSecondlyYield = cumulativeSecondlyYieldLast;
        uint32 timeElapsed = blockTimestamp - timestampLast; // overflow is desired
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            // cumulativeSecondlyYield overflows eventually,
            // due to the way it is used in the oracle that's ok,
            // as long as it doesn't overflow twice during the windowSize
            // see OraclelizedMock.cumulativeOverflowProof() for proof
            cumulativeSecondlyYield +=
                ((this.underlyingTotal() - underlyingTotalLast) *
                    (this.underlyingDecimals())) /
                underlyingTotalLast;
        }
        return (cumulativeSecondlyYield, blockTimestamp);
    }

    function safeToObserve() external view override returns (bool) {
        return _safeToObserve;
    }

    function cumulate() external {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        uint32 timeElapsed = blockTimestamp - timestampLast; // overflow is desired
        // only for the first time in the block && if there's underlying
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            // cumulativeSecondlyYieldLast overflows eventually,
            // due to the way it is used in the oracle that's ok,
            // as long as it doesn't overflow twice during the windowSize
            // see OraclelizedMock.cumulativeOverflowProof() for proof
            cumulativeSecondlyYieldLast +=
                ((this.underlyingTotal() - underlyingTotalLast) *
                    (this.underlyingDecimals())) /
                underlyingTotalLast;
            _safeToObserve = true;
        }
        timestampLast = blockTimestamp;
        underlyingTotalLast = this.underlyingTotal();
    }*/

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

    function setOracle(address oracle_) external {
        oracle = oracle_;
    }

    function setCurrentTime(uint256 now_) external {
        _now = now_;
    }

    function currentTime() external view override returns (uint256) {
        return _now;
    }

    function cumulativeOverflowProof(uint256 diff)
        external
        pure
        returns (uint256)
    {
        uint256 cumulativeLast = uint256(-1); // MAX UINT256
        uint256 cumulativeNow = cumulativeLast + diff; // overflow
        require(
            diff == cumulativeNow - cumulativeLast,
            "OVERFLOW_ASSUMPTION_FAILED"
        );
        return (cumulativeNow - cumulativeLast);
    }
}
