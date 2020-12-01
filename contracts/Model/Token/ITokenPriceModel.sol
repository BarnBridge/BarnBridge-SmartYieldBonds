// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface ITokenPriceModel {

    function price(uint256 _underlyingJunior, uint256 _totalSupplyToken)
        external
        pure
        returns (uint256);

}
