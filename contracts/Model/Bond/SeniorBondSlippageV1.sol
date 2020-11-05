// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO: REVIEW
// x = (cur_j - (bond*x*n*t)) / (cur_tot + bond + (bond*x*n*t)) * n

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./IBondSlippageModel.sol";
import "../../ISmartYieldPool.sol";
import "../../lib/math/Math.sol";

contract SeniorBondSlippageV1 is IBondSlippageModel {
    using SafeMath for uint256;

    function slippage(
        ISmartYieldPool pool,
        uint256 principal,
        uint16 forDays
    ) external override view returns (uint256) {
        // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)

        uint256 t = uint256(forDays).mul(1000).div(pool.DAYS_IN_YEAR());

        uint256 underlyingAll = pool.underlying();
        uint256 underlyingJunior = pool.underlyingJunior();
        uint256 ratePerDay = pool.ratePerDay();
        uint256 ratePerDay2 = ratePerDay.pow(2).div(10**18);

        uint256 nume0 = Math.sqrt(
            principal
                .mul(4)
                .mul(underlyingJunior)
                .mul(ratePerDay2)
                .mul(t).div(1000)
                .add(
                principal.mul(t).div(1000).mul(
                    ratePerDay2.add(underlyingAll).add(principal).pow(2).div(
                        10**18
                    )
                )
            )
        );

        uint256 nume = nume0
            .sub(principal.mul(t).div(1000).mul(ratePerDay2))
            .sub(principal)
            .sub(underlyingAll);

        uint256 deno = principal.mul(2).mul(ratePerDay).mul(t).div(1000);

        return nume.div(deno);
    }
}
