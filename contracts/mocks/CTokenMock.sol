// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

import "../compound-finance/CTokenInterfaces.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CTokenMock is CErc20Interface, ERC20 {
    uint256 public supplyRatePerBlock_ = 0;
    uint256 public exchangeRateStored_ = 0;

    constructor(address _underlying) public ERC20("cDAI Mock", "cDAI") {
        underlying = _underlying;
    }

    // CErc20Interface

    function mint(uint256 mintAmount) external override returns (uint256) {
        _mint(msg.sender, mintAmount.mul(10**18).div(exchangeRateStored_));
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

    function exchangeRateStored() public override view returns (uint256) {
        return exchangeRateStored_;
    }

    // helpers

    function setSupplyRatePerBlock(uint256 newRate) public {
        supplyRatePerBlock_ = newRate;
    }

    function setExchangeRateStored(uint256 newRate) public {
        exchangeRateStored_ = newRate;
    }

    function mockMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function mockBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
