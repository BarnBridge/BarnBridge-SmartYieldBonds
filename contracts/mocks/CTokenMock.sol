// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "../compound-finance/CTokenInterfaces.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CTokenMock is CErc20Interface, ERC20 {
    uint256 public supplyRatePerBlock_ = 0;

    constructor() public ERC20("cDAI Mock", "cDAI") {}

    // CErc20Interface

    function mint(uint256 mintAmount) external override returns (uint256) {
        return 0;
    }

    function redeem(uint256 redeemTokens) external override returns (uint256) {
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount)
        external
        override
        returns (uint256)
    {
        return 0;
    }

    function supplyRatePerBlock() external override view returns (uint256) {
        return supplyRatePerBlock_;
    }

    function balanceOfUnderlying(address owner)
        external
        override
        returns (uint256)
    {
        return 0;
    }

    function exchangeRateStored() public override view returns (uint256) {
        return 0;
    }

    // helpers

    function setSupplyRatePerBlock(uint256 newRate) public returns (uint256) {
        supplyRatePerBlock_ = newRate;
        return supplyRatePerBlock_;
    }
}
