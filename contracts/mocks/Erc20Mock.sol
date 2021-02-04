// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Erc20Mock is ERC20 {
    address public mintCaller = address(0);

    constructor(string memory name, string memory symbol, uint256 decimals_)
      ERC20(name, symbol)
    {
      _setupDecimals(uint8(decimals_));
    }

    function mint(address account, uint256 amount) public {
        mintCaller = msg.sender;
        _mint(account, amount);
    }

    function mintMock(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burnMock(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
