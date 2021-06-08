// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "../Governed.sol";
import "../SmartYield.sol";
import "../IController.sol";
import "../oracle/IYieldOracle.sol";

interface IRegisteredProvider {
  function uToken() external view returns (address);

  function cToken() external view returns (address);

  function transferFees() external;
}

interface IRegisteredController {
  function harvest(uint256) external returns (uint256, uint256);
}

contract Registry is Governed {
  struct Entry {
    string yieldProviderName;
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
    uint8 claimTokenDecimals;
    uint8 version;
    string yieldProviderName;
    string smartYieldSymbol;
    string underlyingSymbol;
    string claimSymbol;
  }

  address[] public smartYields;

  mapping(address => Entry) public entries;

  event Registered(address indexed smartYield);

  function getProtocolInfo(address smartYield) public view returns (Protocol memory) {
    IController controller = IController(SmartYield(smartYield).controller());
    IRegisteredProvider provider = IRegisteredProvider(SmartYield(smartYield).pool());

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
        entries[smartYield].yieldProviderName,
        SmartYield(smartYield).symbol(),
        ERC20(provider.uToken()).symbol(),
        ERC20(provider.cToken()).symbol()
      );
  }

  function getProtocolInfo(uint256 smartYieldIdx) public view returns (Protocol memory) {
    return getProtocolInfo(smartYields[smartYieldIdx]);
  }

  function registerSmartYield(
    address smartYield_,
    string calldata yieldProviderName_,
    uint8 version_
  ) public onlyDaoOrGuardian {
    smartYields.push(smartYield_);
    entries[smartYield_] = Entry(yieldProviderName_, version_);

    emit Registered(smartYield_);
  }

  function transferFees(address[] calldata smartYields_) external {
    for (uint256 i = 0; i < smartYields_.length; i++) {
      IRegisteredProvider provider = IRegisteredProvider(SmartYield(smartYields_[i]).pool());
      provider.transferFees();
    }
  }

  function transferFees() external {
    this.transferFees(smartYields);
  }

  function updateOracles(address[] calldata oracles_) external {
    for (uint256 i = 0; i < oracles_.length; i++) {
      IYieldOracle oracle = IYieldOracle(oracles_[i]);
      oracle.update();
    }
  }

  function harvest(address[] calldata smartYields_) external {
    for (uint256 i = 0; i < smartYields_.length; i++) {
      IRegisteredController controller =
        IRegisteredController(SmartYield(smartYields_[i]).controller());

      controller.harvest(0);
    }
  }
}
