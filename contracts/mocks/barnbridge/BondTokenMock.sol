// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../../BondToken.sol";

contract BondTokenMock is BondToken {
    constructor(
        string memory name,
        string memory symbol,
        address pool
    ) BondToken(name, symbol, pool) {}
}
