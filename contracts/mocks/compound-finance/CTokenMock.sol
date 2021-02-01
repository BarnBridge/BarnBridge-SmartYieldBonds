// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

// https://rinkeby.etherscan.io/address/0x6d7f0754ffeb405d23c51ce938289d4835be3b14#readContract

import "hardhat/console.sol";

import "../../external-interfaces/compound-finance/ICToken.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CTokenMock is ICToken, ERC20 {
    uint256 public exchangeRateStored_ = 0;

    address public override underlying;
    address public override comptroller;

    constructor(address underlying_, address comptroller_) ERC20("cDAI Mock", "cDAI") {
        underlying = underlying_;
        comptroller = comptroller_;
        _setupDecimals(8);
    }

    // CErc20Interface

    function mint(uint256 mintAmount) external override returns (uint256) {
        require(IERC20(underlying).transferFrom(msg.sender, address(this), mintAmount), "CTokenMock: mint transferFrom");
        _mint(msg.sender, mintAmount * 1e18 / (exchangeRateStored_));
        return 0;
    }

    function redeem(uint256 redeemTokens) external override returns (uint256) {
        require(IERC20(underlying).transfer(address(msg.sender), redeemTokens * exchangeRateStored_ / 1e18), "CTokenMock: redeem transfer");
        _burn(msg.sender, redeemTokens);
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount)
        external
        override
        returns (uint256)
    {
        require(IERC20(underlying).transfer(address(msg.sender), redeemAmount), "CTokenMock: redeemUnderlying transfer");
        _burn(msg.sender, redeemAmount * 1e18 / (exchangeRateStored_));
        return 0;
    }

    // https://compound.finance/docs#protocol-math
    function exchangeRateStored() public override view returns (uint256) {
        return exchangeRateStored_;
    }

    // helpers


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
