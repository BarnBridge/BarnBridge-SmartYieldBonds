// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO: REVIEW
// x = (cur_j - (bond*x*n*t)) / (cur_tot + bond + (bond*x*n*t)) * n

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./IBondSlippageModel.sol";
import "../../lib/math/Math.sol";

import "../../ISmartYieldPool.sol";

contract SeniorBondSlippageV1 is IBondSlippageModel {
    using SafeMath for uint256;

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external override view returns (uint256) {
        // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)
        uint256 t = uint256(forDays).mul(1000).div(
            ISmartYieldPool(pool).DAYS_IN_YEAR()
        );

        uint256 ratePerDay2 = (ISmartYieldPool(pool).ratePerDay())
            .mul(ISmartYieldPool(pool).ratePerDay())
            .div(10**18);

        uint256 bn2t = principal.mul(t).div(1000).mul(ratePerDay2);

        return
            nume(
                pool,
                principal,
                ISmartYieldPool(pool).underlyingJunior(),
                bn2t
            )
                .div(deno(pool, principal, t));
    }

    function nume(
        address pool,
        uint256 principal,
        uint256 underlyingJunior,
        uint256 bn2t
    ) internal view returns (uint256) {
        uint256 nume0 = Math.sqrt(
            underlyingJunior.mul(4).mul(bn2t).add(
                bn2t
                    .add(ISmartYieldPool(pool).underlyingTotal())
                    .add(principal)
                    .mul(
                    bn2t.add(ISmartYieldPool(pool).underlyingTotal()).add(
                        principal
                    )
                )
                    .div(10**18)
            )
        );

        nume0 = nume0.sub(bn2t).sub(principal).sub(
            ISmartYieldPool(pool).underlyingTotal()
        );

        return nume0;
    }

    function deno(
        address pool,
        uint256 principal,
        uint256 t
    ) internal view returns (uint256) {
        return
            principal.mul(2).mul(ISmartYieldPool(pool).ratePerDay()).mul(t).div(
                1000
            );
    }
}
