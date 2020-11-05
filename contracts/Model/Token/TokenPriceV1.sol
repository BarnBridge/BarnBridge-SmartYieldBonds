// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO: REVIEW
// _underlyingJunior = junior_liquidity + locked + profit
// _underlyingJunior = underlyingTotal - principalTotal
// price = _underlyingJunior / _totalSupplyToken

import "@openzeppelin/contracts/math/SafeMath.sol";

import "./ITokenPriceModel.sol";

contract TokenPriceV1 is ITokenPriceModel {
    using SafeMath for uint256;

    function price(uint256 _underlyingJunior, uint256 _totalSupplyToken)
        external
        pure
        returns (uint256)
    {
        return
            _totalSupplyToken == 0
                ? 10**18
                : _underlyingJunior.div(_totalSupplyToken.div(10**18));
    }
}
