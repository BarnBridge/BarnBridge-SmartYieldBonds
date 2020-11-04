// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "./IBondSlippageModel.sol";
import "../../lib/math/Math.sol";

contract SeniorBondSlippageV1 is IBondSlippageModel {
    function slippage(
        uint256 principal,
        uint256 providerRatePerDay,
        uint256 seniorTotal,
        uint256 juniorTotal,
        uint16 forDays
    ) external override pure returns (uint256) {
        // TODO: REVIEW &/ CHANGE &/ SIMPLIFY
        uint256 b = Math.sqrt(
            (principal + juniorTotal + seniorTotal)**2 +
                (((principal * providerRatePerDay**2) / (10**18)**2) *
                    4 *
                    juniorTotal *
                    forDays) /
                356
        );
        uint256 a = (b - principal - juniorTotal - seniorTotal);
        return
            a /
            ((((principal * providerRatePerDay) / 10**18) * 2 * forDays) / 356);
    }
}
