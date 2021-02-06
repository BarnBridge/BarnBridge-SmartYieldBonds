// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./IYieldOraclelizable.sol";
import "./IYieldOracle.sol";

// a modified version of https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/examples/ExampleSlidingWindowOracle.sol
// sliding window oracle that uses observations collected over a window to provide moving yield averages in the past
// `windowSize` with a precision of `windowSize / granularity`
contract YieldOracle is IYieldOracle {
    using SafeMath for uint256;

    IYieldOraclelizable public pool;

    struct Observation {
        uint256 timestamp;
        uint256 yieldCumulative;
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
    ) {
        require(granularity_ > 1, "YO: GRANULARITY");
        require(
            (periodSize = windowSize_ / granularity_) * granularity_ ==
                windowSize_,
            "YO: WINDOW_NOT_EVENLY_DIVISIBLE"
        );
        windowSize = windowSize_;
        granularity = granularity_;
        pool = IYieldOraclelizable(pool_);

        for (uint256 i = yieldObservations.length; i < granularity_; i++) {
            yieldObservations.push();
        }
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
        uint8 observationIndex = observationIndexOf(pool.currentTime());
        // no overflow issue. if observationIndex + 1 overflows, result is still zero.
        uint8 firstObservationIndex = (observationIndex + 1) % granularity;
        firstObservation = yieldObservations[firstObservationIndex];
    }

    // update the cumulative price for the observation at the current timestamp. each observation is updated at most
    // once per epoch period.
    function update() external override {
        // get the observation for the current period
        uint8 observationIndex = observationIndexOf(pool.currentTime());
        Observation storage observation = yieldObservations[observationIndex];

        // we only want to commit updates once per period (i.e. windowSize / granularity)
        uint256 timeElapsed = pool.currentTime() - observation.timestamp;
        if (timeElapsed > periodSize) {
            (uint256 yieldCumulative, , ) = pool.cumulatives();
            observation.timestamp = pool.currentTime();
            observation.yieldCumulative = yieldCumulative;
        }
    }

    // given the cumulative yields of the start and end of a period, and the length of the period (timeElapsed in seconds), compute the average
    // yield and extrapolate it for forInterval (seconds) in terms of how much amount out is received for the amount in
    function computeAmountOut(
        uint256 yieldCumulativeStart,
        uint256 yieldCumulativeEnd,
        uint256 timeElapsed,
        uint256 forInterval
    ) private pure returns (uint256 yieldAverage) {
        return
            ((yieldCumulativeEnd - yieldCumulativeStart) * forInterval) / timeElapsed;
    }

    // returns the amount out corresponding to the amount in for a given token using the moving average over the time
    // range [now - [windowSize, windowSize - periodSize * 2], now]
    // update must have been called for the bucket corresponding to timestamp `now - windowSize`
    function consult(uint256 forInterval)
        external
        view
        override
        virtual
        returns (uint256 yieldForInterval)
    {
        Observation storage firstObservation = getFirstObservationInWindow();

        uint256 timeElapsed = pool.currentTime() - firstObservation.timestamp;

        if (!(timeElapsed <= windowSize)) {
            // originally:
            // require(
            //     timeElapsed <= windowSize,
            //     "YO: MISSING_HISTORICAL_OBSERVATION"
            // );
            // if the oracle is falling behind, it reports 0 yield => there's no incentive to buy sBOND
            return 0;
        }

        if (!(timeElapsed >= windowSize - periodSize * 2)) {
            // originally:
            // should never happen.
            // require(
            //     timeElapsed >= windowSize - periodSize * 2,
            //     "YO: UNEXPECTED_TIME_ELAPSED"
            // );
            // if the oracle is in an odd state, it reports 0 yield => there's no incentive to buy sBOND
            return 0;
        }

        (uint256 yieldCumulative, , ) = pool.currentCumulatives();

        return
            computeAmountOut(
                firstObservation.yieldCumulative,
                yieldCumulative,
                timeElapsed,
                forInterval
            );
    }
}
