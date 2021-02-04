// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import "./IBond.sol";

contract SeniorBond is IBond, ERC721 {
    address public override pool;

    constructor(
        string memory name,
        string memory symbol,
        address pool_
    ) ERC721(name, symbol) {
        pool = pool_;
    }

    function mint(address to, uint256 tokenId) public override {
        require(msg.sender == pool, "SB: mint not pool");
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) public override {
        require(msg.sender == pool, "SB: burn not pool");
        _burn(tokenId);
    }
}
