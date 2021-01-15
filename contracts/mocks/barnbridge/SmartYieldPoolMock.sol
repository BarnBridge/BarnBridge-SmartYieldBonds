// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

// @TODO:
import "hardhat/console.sol";

import "../../lib/math/Math.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../../external-interfaces/compound-finance/ICToken.sol";
import "../../model/IBondModel.sol";

import "../../BondToken.sol";

import "../../SmartYieldPoolCompound.sol";

contract SmartYieldPoolMock is SmartYieldPoolCompound {
    constructor(string memory name, string memory symbol)
        SmartYieldPoolCompound(name, symbol)
    {}
}
