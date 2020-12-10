// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract SeniorBondToken is Context, AccessControl, ERC721 {
    bytes32 public constant MINT_BURN_ROLE = keccak256("MINT_BURN_ROLE");

    constructor(
        string memory name,
        string memory symbol,
        address pool
    ) public ERC721(name, symbol) {
        _setupRole(MINT_BURN_ROLE, pool);
    }

    function mint(address to, uint256 tokenId) public {
        require(hasRole(MINT_BURN_ROLE, _msgSender()));
        _mint(to, tokenId);
    }

    function burn(uint256 tokenId) public {
        require(hasRole(MINT_BURN_ROLE, _msgSender()));
        _burn(tokenId);
    }
}
