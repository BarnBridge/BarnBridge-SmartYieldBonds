// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

// @TODO: REVIEW
// x = (cur_j - (bond*x*n*t)) / (cur_tot + bond + (bond*x*n*t)) * n

import "hardhat/console.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../lib/math/Math.sol";
import "../lib/math/Exponential.sol";

import "./IBondModel.sol";
import "../ISmartYieldPool.sol";

contract BondModelExpV1 is IBondModel, Exponential {
    using SafeMath for uint256;
    using Math for uint256;

    function addExp3(
        Exp memory a,
        Exp memory b,
        Exp memory c
    ) internal pure returns (MathError, Exp memory) {
        (MathError err, Exp memory ab) = addExp(a, b);
        if (err != MathError.NO_ERROR) {
            return (err, ab);
        }
        return addExp(ab, c);
    }

    struct SlippageLocalVars {
        Exp t;
        Exp principal;
        Exp underlyingTotal;
        Exp underlyingLiquidity;
        Exp ratePerDay2;
        Exp bn2t;
        Exp numeA;
        Exp numeA2;
        Exp numeB;
        Exp numeS;
        Exp numeC;
        Exp nume;
        Exp deno;
        Exp tmp;
    }

    function slippage(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external override view returns (uint256) {
        SlippageLocalVars memory v;
        MathError mErr;

        // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)
        // b n^2 t -> bnt2
        // (b + o + b n^2 t) -> numeA
        // (b + o + b n^2 t)^2 -> numeA2
        // 4 b j n^2 t -> numeB
        // sqrt(4 b j n^2 t + (b + o + b n^2 t)^2) -> numeS
        // b + o + b n^2 t -> numeC

        (mErr, v.t) = getExp(uint256(forDays), 365);
        v.principal = Exp({mantissa: principal});
        v.underlyingTotal = Exp({
            mantissa: ISmartYieldPool(pool).underlyingTotal()
        });
        v.underlyingLiquidity = Exp({
            mantissa: ISmartYieldPool(pool).underlyingLiquidity()
        });
        (mErr, v.ratePerDay2) = mulExp(
            Exp({mantissa: ISmartYieldPool(pool).ratePerDay()}),
            Exp({mantissa: ISmartYieldPool(pool).ratePerDay()})
        );

        (mErr, v.bn2t) = mulExp3(v.principal, v.ratePerDay2, v.t);
        (mErr, v.numeA) = addExp3(v.bn2t, v.principal, v.underlyingTotal);
        (mErr, v.numeA2) = mulExp(v.numeA, v.numeA);
        (mErr, v.numeB) = mulExp3(
            v.bn2t,
            v.underlyingLiquidity,
            Exp({mantissa: 4 * (10**18)})
        );
        (mErr, v.tmp) = addExp(v.numeA2, v.numeB);
        v.numeS = Exp({mantissa: Math.sqrt(v.tmp.mantissa).mul(10**9)});
        (mErr, v.numeC) = addExp3(v.bn2t, v.principal, v.underlyingTotal);
        (mErr, v.nume) = subExp(v.numeS, v.numeC);
        (mErr, v.tmp) = mulExp3(
            Exp({mantissa: 2 * (10**18)}),
            v.principal,
            Exp({mantissa: ISmartYieldPool(pool).ratePerDay()})
        );
        (mErr, v.deno) = mulExp(v.tmp, v.t);

        (mErr, v.tmp) = divExp(v.nume, v.deno);

        return v.tmp.mantissa;
    }
}
