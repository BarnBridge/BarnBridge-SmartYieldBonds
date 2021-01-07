// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "../../lib/oracle/IYieldOraclelizable.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

contract OraclelizedMock is IYieldOraclelizable {
    uint32 public blockTimestampLast;
    uint256 public cumulativeBlockYieldLast; // cumulative per block yield
    uint256 public blockYieldLastNb;
    uint256 public _underlyingTotal;
    uint256 public underlyingTotalLast;

    constructor() {}

    function currentCumulativeBlockYield()
        external
        view
        override
        returns (uint256 cumulativeYield, uint256 blockNumber)
    {
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint256 cumulativeBlockYield = cumulativeBlockYieldLast;
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            FixedPoint.uq112x112 memory blockYield =
                FixedPoint.encode(
                    uint112(
                        (this.underlyingTotal() - underlyingTotalLast) /
                            (block.number - blockYieldLastNb)
                    )
                );
            cumulativeBlockYield +=
                uint256(
                    FixedPoint.div(blockYield, uint112(underlyingTotalLast))._x
                ) *
                timeElapsed;
        }
        return (cumulativeBlockYield, blockTimestamp);
    }

    function cumulate()
        external
    {
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // only for the first time in the block && if there's underlying
        if (timeElapsed > 0) {
            FixedPoint.uq112x112 memory blockYield =
                FixedPoint.encode(
                    uint112(
                        (this.underlyingTotal() - underlyingTotalLast) /
                            (block.number - blockYieldLastNb)
                    )
                );
            cumulativeBlockYieldLast +=
                uint256(
                    FixedPoint.div(blockYield, uint112(underlyingTotalLast))._x
                ) *
                timeElapsed;

            blockTimestampLast = blockTimestamp;
            blockYieldLastNb = block.number;
        }

        underlyingTotalLast = this.underlyingTotal();
    }

    function underlyingTotal() external view returns (uint256) {
        return _underlyingTotal;
    }

    function setUnderlyingTotal(uint256 underlyingTotal_) external {
      _underlyingTotal = underlyingTotal_;
    }
}
