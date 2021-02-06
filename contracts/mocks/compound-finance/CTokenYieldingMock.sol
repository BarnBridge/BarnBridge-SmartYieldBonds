// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// https://rinkeby.etherscan.io/address/0x6d7f0754ffeb405d23c51ce938289d4835be3b14#readContract

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "./../../lib/math/MathUtils.sol";
import "./../../external-interfaces/compound-finance/ICToken.sol";

import "./../HasClock.sol";
import "./../Erc20Mock.sol";

contract CTokenYieldingMock is HasClock, ICToken, ERC20 {
    uint256 public exchangeRateStored_ = 0;

    address public override comptroller;
    address public override underlying;

    HasClock public clock;

    uint256 public lastYielded;
    uint256 public yieldPerDay;
    uint256 public exchangeRateInitial;

    constructor(address underlying_, address comptroller_, address clock_, uint256 exchangeRateInitial_) HasClock(clock_) ERC20("cDAI Mock", "cDAI") {
        underlying = underlying_;
        comptroller = comptroller_;
        exchangeRateInitial = exchangeRateInitial_;
        _setupDecimals(8);
    }

    // CErc20Interface

    function mint(uint256 mintAmount) external override returns (uint256) {
        doYield();
        _mint(msg.sender, mintAmount * 1e18 / (exchangeRateStored()));
        require(IERC20(underlying).transferFrom(msg.sender, address(this), mintAmount), "CTokenMock: mint transferFrom");
        return 0;
    }

    function redeem(uint256 redeemTokens) external override returns (uint256) {
        doYield();
        require(IERC20(underlying).transfer(address(msg.sender), redeemTokens * exchangeRateStored() / 1e18), "CTokenMock: redeem transfer");
        _burn(msg.sender, redeemTokens);
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount)
        external
        override
        returns (uint256)
    {
        doYield();
        _burn(msg.sender, redeemAmount * 1e18 / (exchangeRateStored()));
        require(IERC20(underlying).transfer(address(msg.sender), redeemAmount), "CTokenMock: redeemUnderlying transfer");
        return 0;
    }

    // https://compound.finance/docs#protocol-math
    function exchangeRateStored() public override view returns (uint256) {
      if (
        0 == Erc20Mock(underlying).balanceOf(address(this))
        || 0 == totalSupply()
      ) {
        return exchangeRateInitial;
      }
      uint256 elapsed = clock.clockCurrentTime() - lastYielded;
      uint16 elapsedDays = uint16(elapsed / (1 days));
      uint256 elapsedRemaining = elapsed - (uint256(elapsedDays) * (1 days));
      uint256 underlyingPrev = Erc20Mock(underlying).balanceOf(address(this));

      uint256 underlyingYielded = MathUtils.compound2(underlyingPrev, yieldPerDay, elapsedDays) - underlyingPrev;
      underlyingYielded += (elapsedRemaining * yieldPerDay / (1 days)) * underlyingPrev / 1e18;

      return (underlyingPrev + underlyingYielded) * 1e18 / totalSupply();
    }

    // helpers


    function setYieldPerDay(uint256 yieldPerDay_) public {
      doYield();
      yieldPerDay = yieldPerDay_;
    }


    function doYield() public {
      if (0 == Erc20Mock(underlying).balanceOf(address(this))) {
        lastYielded = clock.clockCurrentTime();
        return;
      }
      uint256 elapsed = clock.clockCurrentTime() - lastYielded;
      uint16 elapsedDays = uint16(elapsed / (1 days));
      uint256 elapsedRemaining = elapsed - (uint256(elapsedDays) * (1 days));
      uint256 underlyingPrev = Erc20Mock(underlying).balanceOf(address(this));

      uint256 underlyingYielded = MathUtils.compound2(underlyingPrev, yieldPerDay, elapsedDays) - underlyingPrev;
      underlyingYielded += (elapsedRemaining * yieldPerDay / (1 days)) * underlyingPrev / 1e18;

      Erc20Mock(underlying).mintMock(address(this), underlyingYielded);
      lastYielded = clock.clockCurrentTime();
    }


    function mockMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function mockBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

}
