// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../external-interfaces/mai3/ILiquidityPool.sol";
import "./../external-interfaces/mai3/ILpGovernor.sol";

import "./../IProvider.sol";

import "./Mai3Controller.sol";
import "./IMai3Cumulator.sol";

contract Mai3Provider is IProvider {
    using SafeCast for uint256;
    using SafeCast for int256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant EXP_SCALE = 1e18;

    address public override smartYield;

    address public override controller;

    // fees colected in underlying
    uint256 public override underlyingFees;

    // mai3 liquidity pool address
    address public mai3LiquidityPool;

    // underlying token (ie. DAI)
    address public uToken; // IERC20

    // share token of liquidity pool
    address public shareToken;

    // governor address of liquidity pool
    address public governor;

    // shareToken.balanceOf(this) measuring only deposits by users (excludes direct shareToken transfers to pool)
    uint256 public shareTokenBalance;

    bool public _setup;

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier onlySmartYield {
        require(msg.sender == smartYield, "PPC: only smartYield");
        _;
    }

    modifier onlySmartYieldOrController {
        require(msg.sender == smartYield || msg.sender == controller, "PPC: only smartYield/controller");
        _;
    }

    modifier onlyControllerOrDao {
        require(msg.sender == controller || msg.sender == Mai3Controller(controller).dao(), "PPC: only controller/DAO");
        _;
    }

    constructor(address mai3LiquidityPool_) {
        mai3LiquidityPool = mai3LiquidityPool_;
        (, , address[7] memory addresses, , , ) = ILiquidityPool(mai3LiquidityPool_).getLiquidityPoolInfo();
        governor = addresses[3];
        shareToken = addresses[4];
        uToken = addresses[5];
    }

    function setup(address smartYield_, address controller_) external {
        require(false == _setup, "PPC: already setup");

        smartYield = smartYield_;
        controller = controller_;

        updateAllowances();

        _setup = true;
    }

    function setController(address newController_) external override onlyControllerOrDao {
        // remove allowance on old controller
        IERC20 rewardToken = IERC20(ILpGovernor(governor).rewardToken());

        rewardToken.safeApprove(controller, 0);

        controller = newController_;

        // give allowance to new controler
        updateAllowances();
    }

    function updateAllowances() public {
        IERC20 rewardToken = IERC20(ILpGovernor(governor).rewardToken());

        uint256 controllerRewardAllowance = rewardToken.allowance(address(this), controller);
        rewardToken.safeIncreaseAllowance(controller, MAX_UINT256.sub(controllerRewardAllowance));
    }

    // externals

    // take underlyingAmount_ from from_
    function _takeUnderlying(address from_, uint256 underlyingAmount_) external override onlySmartYieldOrController {
        uint256 balanceBefore = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransferFrom(from_, address(this), underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(address(this));
        require(0 == (balanceAfter - balanceBefore - underlyingAmount_), "PPC: _takeUnderlying amount");
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_) external override onlySmartYield {
        uint256 balanceBefore = IERC20(uToken).balanceOf(to_);
        IERC20(uToken).safeTransfer(to_, underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(to_);
        require(0 == (balanceAfter - balanceBefore - underlyingAmount_), "PPC: _sendUnderlying amount");
    }

    // deposit underlyingAmount_ with the liquidity provider, callable by smartYield or controller
    function _depositProvider(uint256 underlyingAmount_, uint256 takeFees_) external override onlySmartYieldOrController {
        _depositProviderInternal(underlyingAmount_, takeFees_);
    }

    // deposit underlyingAmount_ with the liquidity provider, store resulting cToken balance in cTokenBalance
    function _depositProviderInternal(uint256 underlyingAmount_, uint256 takeFees_) internal {
        // underlyingFees += takeFees_
        underlyingFees = underlyingFees.add(takeFees_);
        IMai3Cumulator(controller)._beforeShareTokenBalanceChange();
        IERC20(uToken).approve(address(mai3LiquidityPool), underlyingAmount_);

        ILiquidityPool(mai3LiquidityPool).addLiquidity(underlyingAmount_.toInt256());
        IMai3Cumulator(controller)._afterShareTokenBalanceChange(shareTokenBalance);

        // shareTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        shareTokenBalance = IERC20(shareToken).balanceOf(address(this));
    }

    // withdraw underlyingAmount_ from the liquidity provider, callable by smartYield
    function _withdrawProvider(uint256 underlyingAmount_, uint256 takeFees_) external override onlySmartYield {
        _withdrawProviderInternal(underlyingAmount_, takeFees_);
    }

    // withdraw underlyingAmount_ from the liquidity provider, store resulting shareToken balance in shareTokenBalance
    function _withdrawProviderInternal(uint256 underlyingAmount_, uint256 takeFees_) internal {
        // underlyingFees += takeFees_;
        underlyingFees = underlyingFees.add(takeFees_);
        IMai3Cumulator(controller)._beforeShareTokenBalanceChange();
        ILiquidityPool(mai3LiquidityPool).removeLiquidity(0, underlyingAmount_.toInt256());
        IMai3Cumulator(controller)._afterShareTokenBalanceChange(shareTokenBalance);

        // shareTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        shareTokenBalance = IERC20(shareToken).balanceOf(address(this));
    }

    function transferFees() external override {
        _withdrawProviderInternal(underlyingFees, 0);
        underlyingFees = 0;

        uint256 fees = IERC20(uToken).balanceOf(address(this));
        address to = Mai3Controller(controller).feesOwner();

        IERC20(uToken).safeTransfer(to, fees);

        emit TransferFees(msg.sender, to, fees);
    }

    // current total underlying balance, as measured by pool, without remove penalty(slippage) and fees
    function underlyingBalance() external virtual override returns (uint256) {
        ILiquidityPool(mai3LiquidityPool).forceToSyncState();

        (, int256 cash) = ILiquidityPool(mai3LiquidityPool).queryRemoveLiquidity(shareTokenBalance.toInt256(), 0);
        uint256 cashU256 = cash.toUint256();

        if (cashU256 < underlyingFees) {
            return 0;
        }

        return cashU256 - underlyingFees;
    }

    // use pool margin to calculate the current net asset value
    function netAssetValueCurrent() public returns (uint256) {
        uint256 totalShareToken = IERC20(shareToken).totalSupply();
        if (totalShareToken == 0) {
            return EXP_SCALE;
        }
        ILiquidityPool(mai3LiquidityPool).forceToSyncState();
        (int256 poolMargin, ) = ILiquidityPool(mai3LiquidityPool).getPoolMargin();
        return poolMargin.toUint256().div(totalShareToken);
    }

    // claim liquidity mining reward
    function getReward() external onlyControllerOrDao {
        ILpGovernor(governor).getReward();
    }

    // vote on proposal
    function castVote(uint256 proposalId, bool support) external onlyControllerOrDao {
        ILpGovernor(governor).castVote(proposalId, support);
    }
}
