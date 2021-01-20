// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract BondToken is ERC721 {
    address public pool;

    constructor(
        string memory name,
        string memory symbol,
        address pool_
    ) ERC721(name, symbol) {
        pool = pool_;
    }

    function mint(address to, uint256 tokenId) public {
        require(msg.sender == pool, "BTK: mint not pool");
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) public {
        require(msg.sender == pool, "BTK: burn not pool");
        _burn(tokenId);
    }
}
