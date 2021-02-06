// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

abstract contract JuniorToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}
