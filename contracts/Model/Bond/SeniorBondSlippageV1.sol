// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO: REVIEW
// x = (cur_j - (bond*x*n*t)) / (cur_tot + bond + (bond*x*n*t)) * n

import "hardhat/console.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../lib/math/Math.sol";

import "./IBondSlippageModel.sol";
import "../../ISmartYieldPool.sol";

contract SeniorBondSlippageV1 is IBondSlippageModel {
    using SafeMath for uint256;
    using Math for uint256;

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external override view returns (uint256) {
        // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)
        uint256 t = uint256(forDays).mul(100000).div(365);

        uint256 ratePerDay2 = (ISmartYieldPool(pool).ratePerDay())
            .mul(ISmartYieldPool(pool).ratePerDay())
            .div(10**18);

        uint256 bn2t = principal.mul(t).div(100000).mul(ratePerDay2).div(10**18);

        return
            nume(
                pool,
                principal,
                ISmartYieldPool(pool).underlyingLiquidity(),
                bn2t
            ).mul(10**18)
                .div(deno(pool, principal, t));
    }

    function nume(
        address pool,
        uint256 principal,
        uint256 underlyingLiquidity,
        uint256 bn2t
    ) internal view returns (uint256) {
        uint256 nume0 = underlyingLiquidity
            .mul(4)
            .mul(bn2t)//.div(10**18)
            .add(
            bn2t
                .add(ISmartYieldPool(pool).underlyingTotal())
                .add(principal)
                .mul(
                bn2t.add(ISmartYieldPool(pool).underlyingTotal()).add(principal)
            )
            //.div(10**18)
        )
            .sqrt();

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
            principal.mul(2).mul(ISmartYieldPool(pool).ratePerDay()).div(10**18).mul(t).div(
                100000
            );
    }
}
