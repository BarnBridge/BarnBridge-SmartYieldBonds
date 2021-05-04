// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./WadRayMath.sol";

import "./../Erc20Mock.sol";

import "../../external-interfaces/aave/IAToken.sol";
import "../../external-interfaces/aave/ILendingPool.sol";
import "../../external-interfaces/aave/IStakedTokenIncentivesController.sol";

contract ATokenWorldMock is
    IAToken,
    ILendingPool,
    IStakedTokenIncentivesController,
    ERC20
{
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using WadRayMath for uint256;

    address public _underlying;
    address public _rewardToken;

    uint128 public _liquidityIndex;
    uint128 public _currentLiquidityRate;
    uint256 public _lastAccrued;

    uint256 public mintCalled;
    uint256 public redeemCalled;
    uint256 public redeemUnderlyingCalled;

    constructor(
        uint128 liquidityIndex_,
        uint128 currentLiquidityRate_,
        uint8 underlyingDecimals_
    ) ERC20("aToken mock", "aToken") {
        _setupDecimals(8);
        _liquidityIndex = liquidityIndex_;
        _currentLiquidityRate = currentLiquidityRate_;
        _underlying = address(
            new Erc20Mock("underlying mock", "UNDERLYING", underlyingDecimals_)
        );

        _rewardToken = address(
            new Erc20Mock("rewardToken mock", "REWARD", underlyingDecimals_)
        );
    }

    function mintMock(address to_, uint256 amount_) external {
        _mint(to_, amount_);
    }

    function burnMock(address to_, uint256 amount_) external {
        _burn(to_, amount_);
    }

    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external override {
        IERC20(_underlying).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount.rayDiv(_liquidityIndex));

        mintCalled++;
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        uint256 aTokenAmount = amount.rayDiv(_liquidityIndex);
        _transfer(msg.sender, address(this), aTokenAmount);
        Erc20Mock(_underlying).mintMock(msg.sender, amount);
        _burn(address(this), aTokenAmount);
        redeemUnderlyingCalled++;
        return amount;
    }

    function UNDERLYING_ASSET_ADDRESS()
        external
        view
        override
        returns (address)
    {
        return _underlying;
    }

    function getIncentivesController()
        external
        view
        override
        returns (address)
    {
        return address(this);
    }

    function POOL() external view override returns (address) {
        return address(this);
    }

    function balanceOf(address user)
        public
        view
        override(ERC20, IAToken)
        returns (uint256)
    {
        return ERC20.balanceOf(user).rayMul(_liquidityIndex);
    }

    function getReserveNormalizedIncome(address asset)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return _liquidityIndex;
    }

    function claimRewards(
        address[] calldata assets,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        Erc20Mock(_rewardToken).mintMock(to, amount);
        return amount;
    }

    function REWARD_TOKEN() external view override returns (address) {
      return _rewardToken;
    }

    function getReserveData(address asset)
        external
        view
        override
        returns (ILendingPool.ReserveData memory)
    {
        ILendingPool.ReserveData memory reserveData =
            ILendingPool.ReserveData(
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
        uint256 timeElapsed = (block.timestamp - _lastAccrued);

        if (timeElapsed == 0) {
            return _liquidityIndex;
        }

        _liquidityIndex = uint128(calculateLinearInterest(_currentLiquidityRate, uint40(_lastAccrued)).rayMul(_liquidityIndex));

        _lastAccrued = block.timestamp;
        return _liquidityIndex;
    }

    function setCurrentLiquidityRate(uint128 currentLiquidityRate_) external {
        _currentLiquidityRate = currentLiquidityRate_;
    }

    function setLiquidityIndex(uint128 liquidityIndex_) external {
        _liquidityIndex = liquidityIndex_;
    }

    function calculateLinearInterest(uint256 rate, uint40 lastUpdateTimestamp)
        internal
        view
        returns (uint256)
    {
        //solium-disable-next-line
        uint256 timeDifference =
            block.timestamp.sub(uint256(lastUpdateTimestamp));

        return
            (rate.mul(timeDifference) / 365 days).add(WadRayMath.ray());
    }
}
