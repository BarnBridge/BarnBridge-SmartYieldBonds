// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// used by the compound provider tests

// https://rinkeby.etherscan.io/address/0x6d7f0754ffeb405d23c51ce938289d4835be3b14#readContract

import "hardhat/console.sol";

import "./../Erc20Mock.sol";

import "../../external-interfaces/compound-finance/ICToken.sol";
import "./ComptrollerMock.sol";

contract CTokenMock is ICToken, ERC20 {

    address public _underlying;
    address public _comptroller;
    uint256 public _exchangeRateStored;

    uint256 public mintCalled;
    uint256 public redeemCalled;
    uint256 public redeemUnderlyingCalled;

    constructor()
      ERC20("cDAI mock", "cDAI")
    {
      _setupDecimals(8);
    }

    function setup(address underlying_, address comptroller_, uint256 exchangeRateStored_)
      external
    {
      _underlying = underlying_;
      _comptroller = comptroller_;
      _exchangeRateStored = exchangeRateStored_;

      mintCalled = 0;
      redeemCalled = 0;
      redeemUnderlyingCalled = 0;
    }

    function mint(uint256 mintAmount)
      external override
    returns (uint256)
    {
        require(Erc20Mock(_underlying).transferFrom(msg.sender, address(this), mintAmount), "CTokenMock: mint transferFrom");
        Erc20Mock(_underlying).burnMock(address(this), mintAmount);
        _mint(msg.sender, mintAmount * 1e18 / (_exchangeRateStored));
        mintCalled++;
        return 0;
    }

    function redeem(uint256 redeemTokens)
      external override
    returns (uint256)
    {
        Erc20Mock(_underlying).mintMock(address(msg.sender), redeemTokens * _exchangeRateStored / 1e18);
        _burn(msg.sender, redeemTokens);
        redeemCalled++;
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount)
      external override
    returns (uint256)
    {
        Erc20Mock(_underlying).mintMock(address(msg.sender), redeemAmount);
        _burn(msg.sender, redeemAmount * 1e18 / (_exchangeRateStored));
        redeemUnderlyingCalled++;
        return 0;
    }

    function exchangeRateStored() external view override returns (uint256) {
      return _exchangeRateStored;
    }

    function underlying() external view override returns (address) {
      return _underlying;
    }

    function comptroller() external view override returns (address) {
      return _comptroller;
    }

    function mintMock(address to_, uint256 amount_) external {
      _mint(to_, amount_);
    }

    function burnMock(address to_, uint256 amount_) external {
      _burn(to_, amount_);
    }

    function setExchangeRateStored(uint256 exchangeRateStored_) external {
      _exchangeRateStored = exchangeRateStored_;
    }

}
