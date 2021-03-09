// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../../Erc20Mock.sol";
import "../../compound-finance/CompOracleMock.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract HarvestWorldMock {

  using SafeERC20 for IERC20;

  uint256 public constant MAX_UINT256 = uint256(-1);

  address public compoundController;
  uint256 public claimCompAmount;

  address public compAddress;
  address public uTokenAddress;
  address public oracleAddress;

  uint256 public depositedUnderlyingAmount;
  uint256 public underlyingFees;

  constructor(uint8 utokenDecimals_) {
    compAddress = address(new Erc20Mock("comp", "COMP", 18));
    uTokenAddress = address(new Erc20Mock("underlying", "UNDERLYING", utokenDecimals_));
    oracleAddress = address(new CompOracleMock());
  }

  function decimals() public view returns (uint8) {
    return Erc20Mock(uTokenAddress).decimals();
  }

  function cToken() public view returns (address) {
    return address(this);
  }

  function underlying() public view returns (address) {
    return uTokenAddress;
  }

  function oracle() public view returns (address) {
    return oracleAddress;
  }

  function uToken() public view returns (address) {
    return uTokenAddress;
  }

  function comptroller() public view returns (address) {
    return address(this);
  }

  function getCompAddress() public view returns (address) {
    return compAddress;
  }

  function _takeUnderlying(address from_, uint256 underlyingAmount) external {
    IERC20(uTokenAddress).safeTransferFrom(from_, address(this), underlyingAmount);
  }

  function _depositProvider(uint256 underlyingAmount_, uint256 fee_) external {
    depositedUnderlyingAmount += underlyingAmount_;
    underlyingFees += fee_;
  }

  function claimComp(address[] memory holders, address[] memory markets, bool borrowers, bool suppliers) external {
    require(holders.length == 1, "HarvestWorldMock: holders.length");
    require(holders[0] == address(this), "HarvestWorldMock: holders[0]");
    require(markets.length == 1, "HarvestWorldMock: markets.length");
    require(markets[0] == address(this), "HarvestWorldMock: markets[0]");
    require(borrowers == false, "HarvestWorldMock: borrowers");
    require(suppliers == true, "HarvestWorldMock: suppliers");

    Erc20Mock(compAddress).mintMock(address(this), claimCompAmount);
  }

  function setMockAmounts(uint256 claimCompAmount_)
    public
  {
    claimCompAmount = claimCompAmount_;
  }

  function setMockAllowances(address controller_)
    public
  {
    IERC20(compAddress).safeApprove(controller_, MAX_UINT256);
  }

}
