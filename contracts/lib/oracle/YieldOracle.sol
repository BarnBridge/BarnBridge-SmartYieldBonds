// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./IYieldOraclelizable.sol";
import "../../ASmartYieldPool.sol";

// sliding window oracle that uses observations collected over a window to provide moving price averages in the past
// `windowSize` with a precision of `windowSize / granularity`
// note this is a singleton oracle and only needs to be deployed once per desired parameters, which
// differs from the simple oracle which must be deployed once per pair.
contract YieldOracle {
    using FixedPoint for *;
    using SafeMath for uint256;

    IYieldOraclelizable public pool;

    struct Observation {
        uint256 timestamp;
        uint256 blockYieldCumulative;
    }

    // the desired amount of time over which the moving average should be computed, e.g. 24 hours
    uint256 public immutable windowSize;
    // the number of observations stored for each pair, i.e. how many price observations are stored for the window.
    // as granularity increases from 1, more frequent updates are needed, but moving averages become more precise.
    // averages are computed over intervals with sizes in the range:
    //   [windowSize - (windowSize / granularity) * 2, windowSize]
    // e.g. if the window size is 24 hours, and the granularity is 24, the oracle will return the average price for
    //   the period:
    //   [now - [22 hours, 24 hours], now]
    uint8 public immutable granularity;
    // this is redundant with granularity and windowSize, but stored for gas savings & informational purposes.
    uint256 public immutable periodSize;

    // list of yield observations
    Observation[] public yieldObservations;

    constructor(
        address pool_,
        uint256 windowSize_,
        uint8 granularity_
    ) public {
        require(granularity_ > 1, "YO: GRANULARITY");
        require(
            (periodSize = windowSize_ / granularity_) * granularity_ ==
                windowSize_,
            "YO: WINDOW_NOT_EVENLY_DIVISIBLE"
        );
        windowSize = windowSize_;
        granularity = granularity_;
        pool = ASmartYieldPool(pool_);
    }

    // returns the index of the observation corresponding to the given timestamp
    function observationIndexOf(uint256 timestamp)
        public
        view
        returns (uint8 index)
    {
        uint256 epochPeriod = timestamp / periodSize;
        return uint8(epochPeriod % granularity);
    }

    // returns the observation from the oldest epoch (at the beginning of the window) relative to the current time
    function getFirstObservationInWindow()
        private
        view
        returns (Observation storage firstObservation)
    {
        uint8 observationIndex = observationIndexOf(block.timestamp);
        // no overflow issue. if observationIndex + 1 overflows, result is still zero.
        uint8 firstObservationIndex = (observationIndex + 1) % granularity;
        firstObservation = yieldObservations[firstObservationIndex];
    }

    // update the cumulative price for the observation at the current timestamp. each observation is updated at most
    // once per epoch period.
    function update() external {
        // populate the array with empty observations (first call only)
        for (uint256 i = yieldObservations.length; i < granularity; i++) {
            yieldObservations.push();
        }

        // get the observation for the current period
        uint8 observationIndex = observationIndexOf(block.timestamp);
        Observation storage observation = yieldObservations[observationIndex];

        // we only want to commit updates once per period (i.e. windowSize / granularity)
        uint256 timeElapsed = block.timestamp - observation.timestamp;
        if (timeElapsed > periodSize) {
            (uint256 blockYieldCumulative, ) =
                pool.currentCumulativeBlockYield();
            observation.timestamp = block.timestamp;
            observation.blockYieldCumulative = blockYieldCumulative;
        }
    }

    // given the cumulative prices of the start and end of a period, and the length of the period, compute the average
    // price in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 blockYieldCumulativeStart,
        uint256 blockYieldCumulativeEnd,
        uint256 timeElapsed
    ) private pure returns (uint256 blockYieldAverage) {
        // overflow is desired.
        FixedPoint.uq112x112 memory blockYield =
            FixedPoint.uq112x112(
                uint224(
                    (blockYieldCumulativeEnd - blockYieldCumulativeStart) /
                        timeElapsed
                )
            );
        return blockYield.decode();
    }

    // returns the amount out corresponding to the amount in for a given token using the moving average over the time
    // range [now - [windowSize, windowSize - periodSize * 2], now]
    // update must have been called for the bucket corresponding to timestamp `now - windowSize`
    function consult() external view returns (uint256 amountOut) {
        Observation storage firstObservation = getFirstObservationInWindow();

        uint256 timeElapsed = block.timestamp - firstObservation.timestamp;
        require(
            timeElapsed <= windowSize,
            "YO: MISSING_HISTORICAL_OBSERVATION"
        );
        // should never happen.
        require(
            timeElapsed >= windowSize - periodSize * 2,
            "YO: UNEXPECTED_TIME_ELAPSED"
        );

        (uint256 blockYieldCumulative, ) = pool.currentCumulativeBlockYield();

        return
            computeAmountOut(
                firstObservation.blockYieldCumulative,
                blockYieldCumulative,
                timeElapsed
            );
    }
}
