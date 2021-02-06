// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import "./IBond.sol";

contract JuniorBond is IBond, ERC721 {
    address public override smartYield;

    constructor(
        string memory name,
        string memory symbol,
        address smartYield_
    ) ERC721(name, symbol) {
        smartYield = smartYield_;
    }

    function mint(address to, uint256 tokenId) public override {
        require(msg.sender == smartYield, "JB: mint not smartYield");
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) public override {
        require(msg.sender == smartYield, "JB: burn not smartYield");
        _burn(tokenId);
    }
}
