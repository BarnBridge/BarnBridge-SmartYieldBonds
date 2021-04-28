// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

// used by the compound provider tests

// https://rinkeby.etherscan.io/address/0x6d7f0754ffeb405d23c51ce938289d4835be3b14#readContract

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../Erc20Mock.sol";

import "../../external-interfaces/aave/IAToken.sol";
import "../../external-interfaces/aave/ILendingPool.sol";
import "../../external-interfaces/aave/IStakedTokenIncentivesController.sol";

contract ATokenWorldMock is IAToken, ILendingPool, IStakedTokenIncentivesController, ERC20 {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public _underlying;

    uint128 public _liquidityIndex;
    uint128 public _currentLiquidityRate;
    uint256 public _lastAccrued;

    uint256 public mintCalled;
    uint256 public redeemCalled;
    uint256 public redeemUnderlyingCalled;

    constructor(uint128 liquidityIndex_, uint128 currentLiquidityRate_, uint8 underlyingDecimals_)
      ERC20("aToken mock", "aToken")
    {
      _setupDecimals(8);
      _liquidityIndex = liquidityIndex_;
      _currentLiquidityRate = currentLiquidityRate_;
      _underlying = address(new Erc20Mock("underlying mock", "UNDERLYING", underlyingDecimals_));
    }

    function mintMock(address to_, uint256 amount_) external {
      _mint(to_, amount_);
    }

    function burnMock(address to_, uint256 amount_) external {
      _burn(to_, amount_);
    }

    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
      external override
    {
      IERC20(_underlying).safeTransferFrom(msg.sender, address(this), amount);
      _mint(msg.sender, (amount * 1e18 / this.getReserveNormalizedIncome(asset)));

      mintCalled++;
    }

    function withdraw(address asset, uint256 amount, address to)
      external override
    returns (uint256)
    {
      uint256 aTokenAmount = amount * 1e18 / (this.getReserveNormalizedIncome(asset));
      _transfer(msg.sender, address(this), aTokenAmount);
      Erc20Mock(_underlying).mintMock(msg.sender, amount);
      _burn(address(this), aTokenAmount);
      redeemUnderlyingCalled++;
      return 0;
    }

    function UNDERLYING_ASSET_ADDRESS() external view override returns (address) {
      return _underlying;
    }

    function getIncentivesController() external view override returns (address) {
      return address(this);
    }

    function POOL() external view override returns (address) {
      return address(this);
    }

    function balanceOf(address user) public view override (IAToken, ERC20) returns (uint256) {
      return 0;
    }

    function getReserveNormalizedIncome(address asset)
      external view
      virtual override
      returns (uint256)
    {
      return _liquidityIndex;
    }

      function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to
      ) external override returns (uint256) {
        return 0;
      }

    function getReserveData(address asset) external view override returns (ILendingPool.ReserveData memory) {
      ILendingPool.ReserveData memory reserveData = ILendingPool.ReserveData(
        ILendingPool.ReserveConfigurationMap(0),
        //the liquidity index. Expressed in ray
        _liquidityIndex,
        //variable borrow index. Expressed in ray
        0,
        //the current supply rate. Expressed in ray
        _currentLiquidityRate,
        //the current variable borrow rate. Expressed in ray
        0,
        //the current stable borrow rate. Expressed in ray
        0,
        0,
        //tokens addresses
        address(0),
        address(0),
        address(0),
        //address of the interest rate strategy
        address(0),
        //the id of the reserve. Represents the position in the list of the active reserves
        0
      );

      return reserveData;
    }



    function accrueInterest() external returns (uint256) {
      uint256 blocksElapsed = (block.timestamp - _lastAccrued) / 15;

      if (blocksElapsed == 0) {
        return 0;
      }

      _lastAccrued = _lastAccrued.add(blocksElapsed.mul(15));
      _liquidityIndex = uint128(uint256(_liquidityIndex).add(_liquidityIndex * blocksElapsed.mul(_currentLiquidityRate) / 1e18));
      return 0;
    }

    function setCurrentLiquidityRate(uint128 currentLiquidityRate_) external {
      this.accrueInterest();
      _currentLiquidityRate = currentLiquidityRate_;
    }

}
