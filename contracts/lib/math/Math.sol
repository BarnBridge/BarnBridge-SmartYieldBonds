// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

library Math {
    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x < y ? x : y;
    }

    // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    function compound(
        uint256 principal,
        uint256 ratePerPeriod,
        uint16 periods
    ) internal pure returns (uint256) {
        // from https://medium.com/coinmonks/math-in-solidity-part-4-compound-interest-512d9e13041b
        periods -= 1;
        while (periods > 0) {
            principal += (principal * ratePerPeriod) / 10**18;
            periods -= 1;
        }
        return principal;
    }

}
