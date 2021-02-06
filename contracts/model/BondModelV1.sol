// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// x = (cur_j - (b_p*x*b_t)) / (cur_tot + b_p + (b_p*x*b_t)) * n
// x = (cur_j - (bond*n*t*(cur_j/cur_tot))) / (cur_tot + bond + (bond*n*t*(cur_j/cur_tot))) * n;
// n - oracle rate ( /day )
// bond - new bond principal
// t - bond duration (days)
// cur_j - curent junior liquidity. totalUndwerlying() - abond.principal - abond.gain - (jtokens in withdrawl * jtoken price)
// cur_tot - totalUnderlying()

import "@openzeppelin/contracts/math/SafeMath.sol";

import "../lib/math/MathUtils.sol";
import "./IBondModel.sol";
import "../ISmartYield.sol";

contract BondModelV1 is IBondModel {
    using SafeMath for uint256;

    function gain(
        address pool,
        uint256 principal,
        uint16 forDays
    ) external view override returns (uint256) {
        uint256 loanable = ISmartYield(pool).underlyingLoanable();
        uint256 total = ISmartYield(pool).underlyingTotal();
        uint256 dailyRate = ISmartYield(pool).providerRatePerDay();

        //uint256 aproxGain = MathUtils.compound(principal, dailyRate * (loanable * 1e18 / (total + principal)) / 1e18, forDays).sub(principal);
        uint256 aproxGain = MathUtils.compound2(
          principal,
          //dailyRate * (loanable * 1e18 / (total + principal)) / 1e18,
          uint256(1e18).mul(dailyRate).mul(loanable) / (total + principal) / 1e18,
          forDays
        ).sub(principal);

        //uint256 rate = (loanable.sub(aproxGain, "BondModelV1: liquidity")) * 1e18 / (total + principal) * dailyRate / 1e18;
        uint256 rate = uint256(1e18).mul(dailyRate).mul(loanable.sub(aproxGain, "BondModelV1: liquidity")) / (total + principal) / 1e18;

        return MathUtils.compound2(principal, rate, forDays).sub(principal);
    }

}
