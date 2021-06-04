// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

interface ICrCToken {
    function mint(uint mintAmount) external returns (uint256);
    function redeemUnderlying(uint redeemAmount) external returns (uint256);
    function accrueInterest() external returns (uint256);
    function exchangeRateStored() external view returns (uint256);
    function exchangeRateCurrent() external returns (uint256);
    function supplyRatePerBlock() external view returns (uint256);
    function totalBorrows() external view returns (uint256);
    function getCash() external view returns (uint256);
    function underlying() external view returns (address);
    function comptroller() external view returns (address);
}
