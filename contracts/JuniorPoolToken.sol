// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract JuniorPoolToken is Context, AccessControl, ERC20 {
    bytes32 public constant MINT_BURN_ROLE = keccak256("MINT_BURN_ROLE");

    constructor(
        string memory name,
        string memory symbol,
        address pool
    ) public ERC20(name, symbol) {
        _setupRole(MINT_BURN_ROLE, pool);
    }

    function mint(address account, uint256 amount) public {
        require(hasRole(MINT_BURN_ROLE, _msgSender()));
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        require(hasRole(MINT_BURN_ROLE, _msgSender()));
        _burn(account, amount);
    }
}
