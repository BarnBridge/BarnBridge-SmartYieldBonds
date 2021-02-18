// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

interface IBondModel {

    function gain(address pool_, uint256 principal_, uint16 forDays_) external view returns (uint256);

    function maxDailyRate(address pool_) external view returns (uint256);

}
