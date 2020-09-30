// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/GSN/Context.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SmartYieldToken is Context, AccessControl, ERC20 {
    bytes32 public constant PIPE_ROLE = keccak256("PIPE_ROLE");

    //bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor(
        string memory name,
        string memory symbol,
        address pipe
    ) public ERC20(name, symbol) {
        grantRole(PIPE_ROLE, pipe);
    }

    function mint(address account, uint256 amount) public {
        require(hasRole(PIPE_ROLE, _msgSender()));
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        require(hasRole(PIPE_ROLE, _msgSender()));
        _burn(account, amount);
    }
}
