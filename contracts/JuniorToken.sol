// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./IJuniorToken.sol";

contract JuniorToken is IJuniorToken, ERC20 {
    address public override pool;

    constructor(
        string memory name,
        string memory symbol,
        address pool_
    ) ERC20 (name, symbol) {
        pool = pool_;
    }

    function mint(address to, uint256 amount) public override {
        require(msg.sender == pool, "JT: mint not pool");
        _mint(to, amount);
    }

    function burn(address to, uint256 amount) public override {
        require(msg.sender == pool, "JT: burn not pool");
        _burn(to, amount);
    }
}
