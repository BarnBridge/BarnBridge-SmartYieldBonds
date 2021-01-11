// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../lib/oracle/IYieldOraclelizable.sol";
import "../../lib/oracle/IYieldOracle.sol";

contract OraclelizedMock is IYieldOraclelizable {
    uint32 public blockTimestampLast;
    uint256 public cumulativeSecondlyYieldLast; // cumulative per block yield
    uint256 public _underlyingTotal;
    uint256 public underlyingTotalLast;

    address public oracle;

    bool public _safeToObserve = false;

    constructor() {}

    function setOracle(address oracle_) external {
        oracle = oracle_;
    }

    function currentCumulativeSecondlyYield()
        external
        view
        override
        returns (uint256 cumulativeYield, uint256 blockNumber)
    {
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint256 cumulativeBlockYield = cumulativeSecondlyYieldLast;
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            cumulativeBlockYield +=
                ((this.underlyingTotal() - underlyingTotalLast) * (1 ether)) /
                underlyingTotalLast;
        }
        return (cumulativeBlockYield, blockTimestamp);
    }

    function safeToObserve() external view override returns (bool) {
        return _safeToObserve;
    }

    function cumulate() external {
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // only for the first time in the block && if there's underlying
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            cumulativeSecondlyYieldLast +=
                ((this.underlyingTotal() - underlyingTotalLast) * (1 ether)) /
                underlyingTotalLast;
            _safeToObserve = true;
        }
        blockTimestampLast = blockTimestamp;
        underlyingTotalLast = this.underlyingTotal();
    }

    function underlyingTotal() external view returns (uint256) {
        return _underlyingTotal;
    }

    function setUnderlyingTotal(uint256 underlyingTotal_) external {
        _underlyingTotal = underlyingTotal_;
        this.cumulate();
        IYieldOracle(oracle).update();
    }
}
