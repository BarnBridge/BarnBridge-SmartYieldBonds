// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// used by the cream provider tests

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../Erc20Mock.sol";

import "../../external-interfaces/cream-finance/ICrCToken.sol";
import "../../external-interfaces/cream-finance/ICrComptroller.sol";

contract CrCTokenWorldMock is ICrCToken, ICrComptroller, ERC20 {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public _underlying;
    address public _comp;

    uint256 public _exchangeRateStored;
    uint256 public _supplyRatePerBlock;
    uint256 public _compSpeed;
    uint256 public _lastAccrued;

    uint256 public mintCalled;
    uint256 public redeemCalled;
    uint256 public redeemUnderlyingCalled;

    address public expectClaimComp_holder;

    constructor(uint256 exchangeRateStored_, uint256 supplyRatePerBlock_, uint256 compSpeed_, uint8 underlyingDecimals_)
      ERC20("CrCToken mock", "CrCToken")
    {
      _setupDecimals(8);
      _underlying = address(new Erc20Mock("underlying mock", "UNDERLYING", underlyingDecimals_));
      _comp = address(new Erc20Mock("COMP mock", "COMP", 18));

      _lastAccrued = block.timestamp;
      _exchangeRateStored = exchangeRateStored_;
      _supplyRatePerBlock = supplyRatePerBlock_;
      _compSpeed = compSpeed_;
    }

    function mintMock(address to_, uint256 amount_) external {
      _mint(to_, amount_);
    }

    function burnMock(address to_, uint256 amount_) external {
      _burn(to_, amount_);
    }

    function mint(uint256 mintAmount)
      external override
    returns (uint256)
    {
      IERC20(_underlying).safeTransferFrom(msg.sender, address(this), mintAmount);
      _mint(msg.sender, (mintAmount * 1e18 / this.exchangeRateCurrent()));

      mintCalled++;
      return 0;
    }

    function redeemUnderlying(uint256 redeemAmount)
      external override
    returns (uint256)
    {
      uint256 cTokenAmount = redeemAmount * 1e18 / (this.exchangeRateCurrent());
      _transfer(msg.sender, address(this), cTokenAmount);
      Erc20Mock(_underlying).mintMock(msg.sender, redeemAmount);
      _burn(address(this), cTokenAmount);
      redeemUnderlyingCalled++;
      return 0;
    }

    function exchangeRateStored() external view override returns (uint256) {
      return _exchangeRateStored;
    }

    function exchangeRateCurrent() external override returns (uint256) {
      this.accrueInterest();
      return _exchangeRateStored;
    }

    function underlying() external view override returns (address) {
      return _underlying;
    }

    function accrueInterest() external override returns (uint256) {
      uint256 blocksElapsed = (block.timestamp - _lastAccrued) / 15;

      if (blocksElapsed == 0) {
        return 0;
      }

      _lastAccrued = _lastAccrued.add(blocksElapsed.mul(15));
      _exchangeRateStored = _exchangeRateStored.add(_exchangeRateStored * blocksElapsed.mul(_supplyRatePerBlock) / 1e18);
      return 0;
    }

    function supplyRatePerBlock() external view override returns (uint256) {
      return _supplyRatePerBlock;
    }

    function totalBorrows() external view override returns (uint256) {
      return 0;
    }

    function getCash() external view override returns (uint256) {
      return 0;
    }

    function comptroller() external view override returns (address) {
      return address(this);
    }

    function enterMarkets(address[] memory cTokens) external override returns (uint256[] memory) {
      uint256[] memory ret = new uint256[](1);
      ret[0] = 0;
      return ret;
    }

    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers) external override {
      require(holders.length == 1, "holders");
      require(holders[0] == expectClaimComp_holder, "holder");
      require(cTokens.length == 1, "cTokens");
      require(cTokens[0] == address(this), "cToken");
      require(borrowers == false, "borrowers");
      require(suppliers == true, "suppliers");
      Erc20Mock(_comp).mintMock(expectClaimComp_holder, 5 * 1e18);
    }

    function expectClaimComp(address holder) public {
      expectClaimComp_holder = holder;
    }

    function mintAllowed(address cToken, address minter, uint256 mintAmount) external override returns (uint256) {
      return 0;
    }

    function getCompAddress() external view override returns(address) {
      return _comp;
    }

    function compSupplyState(address cToken) external view override returns (uint224, uint32) {
      return (0, 0);
    }

    function compSpeeds(address cToken) external view override returns (uint256) {
      return 0;
    }

    function oracle() public view override returns (address) {
      return address(0);
    }

    function setSupplyRatePerBlock(uint256 supplyRatePerBlockNew_) external {
      this.accrueInterest();
      _supplyRatePerBlock = supplyRatePerBlockNew_;
    }

}
