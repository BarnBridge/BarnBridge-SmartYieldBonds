// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../SmartYield.sol";
import "../IController.sol";

interface IRegistryProvider {
  function uToken() external view returns (address);

  function cToken() external view returns (address);
}

contract Registry {
  struct Entry {
    string claimProvider;
    uint8 version;
  }

  struct Protocol {
    address smartYield;
    address provider;
    address controller;
    address oracle;
    address bondModel;
    address juniorBond;
    address seniorBond;
    address underlyingToken;
    address claimToken;
    uint8 smartYieldDecimals;
    uint8 underlyingDecimals;
    uint8 claimDecimals;
    uint8 version;
    string claimProvider;
    string smartYieldSymbol;
    string underlyingSymbol;
    string claimSymbol;
  }

  address[] public smartYields;
  mapping(address => Entry) public entries;

  function getProtocolInfo(address smartYield) public view returns (Protocol memory) {
    IController controller = IController(SmartYield(smartYield).controller());
    IRegistryProvider provider = IRegistryProvider(SmartYield(smartYield).pool());

    return
      Protocol(
        smartYield,
        controller.pool(),
        address(controller),
        controller.oracle(),
        controller.bondModel(),
        SmartYield(smartYield).juniorBond(),
        SmartYield(smartYield).seniorBond(),
        provider.uToken(),
        provider.cToken(),
        SmartYield(smartYield).decimals(),
        ERC20(provider.uToken()).decimals(),
        ERC20(provider.cToken()).decimals(),
        entries[smartYield].version,
        entries[smartYield].claimProvider,
        SmartYield(smartYield).symbol(),
        ERC20(provider.uToken()).symbol(),
        ERC20(provider.cToken()).symbol()
      );
  }

  function getProtocolInfo(uint256 smartYieldIdx) public view returns (Protocol memory) {
    return getProtocolInfo(smartYields[smartYieldIdx]);
  }
}
