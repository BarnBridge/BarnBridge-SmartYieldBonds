// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

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

    struct SlippageLocalVars {
        uint256 t;
        uint256 underlyingTotal;
        uint256 underlyingLiquidity;
        uint256 ratePerDay2;
        uint256 bn2t;
        uint256 nume;
        uint256 deno;
    }

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external override view returns (uint256) {
        SlippageLocalVars memory v;
        // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)
        v.t = uint256(forDays).mul(10**18).div(365);

        v.ratePerDay2 = (ISmartYieldPool(pool).ratePerDay())
            .mul(ISmartYieldPool(pool).ratePerDay())
            .div(10**18);

        v.bn2t = principal.mul(v.t).div(10**18).mul(v.ratePerDay2).div(10**18);
        v.underlyingLiquidity = ISmartYieldPool(pool).underlyingLiquidity();
        v.underlyingTotal = ISmartYieldPool(pool).underlyingTotal();

        v.nume = v.underlyingLiquidity
            .mul(4)
            .mul(v.bn2t)
            .add(
            v.bn2t.add(v.underlyingTotal).add(principal).mul(
                v.bn2t.add(v.underlyingTotal).add(principal)
            )
        )
            .sqrt();

        v.nume = v.nume.sub(v.bn2t).sub(principal).sub(v.underlyingTotal);
        v.deno = principal
                .mul(2)
                .mul(ISmartYieldPool(pool).ratePerDay())
                .div(10**18)
                .mul(v.t)
                .div(10**18);
        return
            v.nume
                .mul(10**18)
                .div(v.deno);
    }
}
