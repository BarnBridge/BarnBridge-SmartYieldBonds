// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "./oracle/IYieldOraclelizable.sol";

abstract contract IProviderPool is IYieldOraclelizable {

    address public smartYield;

    address public controller;

    // fees colected in underlying
    uint256 public underlyingFees;

    // previously measured total underlying
    uint256 public underlyingBalanceLast;

    // CUMULATIVE
    // cumulates (new yield per second) * (seconds since last cumulation)
    uint256 public cumulativeSecondlyYieldLast;
    // cummulates balanceOf underlying
    uint256 public cumulativeUnderlyingBalanceLast;
    // timestamp of the last cumulation
    uint32 public cumulativeTimestampLast;
    // /CUMULATIVE

    modifier onlySmartYield {
      require(
        msg.sender == smartYield,
        "IPP: only smartYield"
      );
      _;
    }

    // current total underlying balance as measured by the pool
    function underlyingBalance() external view virtual returns (uint256);

    function harvest() external virtual;

    function transferFees() external virtual;

    // deposit underlyingAmount_ into provider, add takeFees_ to fees
    function _depositProvider(uint256 underlyingAmount_, uint256 takeFees_) external virtual;

    // withdraw underlyingAmount_ from provider, add takeFees_ to fees
    function _withdrawProvider(uint256 underlyingAmount_, uint256 takeFees_) external virtual;

    function _takeUnderlying(address from_, uint256 amount_) external virtual;

    function _sendUnderlying(address to_, uint256 amount_) external virtual returns (bool);
}
