// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IJuniorToken is IERC20 {
    function pool() external view returns (address);

    function mint(address to, uint256 amount) external;

    function burn(address to, uint256 amount) external;
}
