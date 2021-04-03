// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

// used by the compound provider tests

// https://rinkeby.etherscan.io/address/0x6d7f0754ffeb405d23c51ce938289d4835be3b14#readContract

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/SafeCast.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./Mai3OracleMock.sol";
import "./../Erc20Mock.sol";

import "../../external-interfaces/mai3/ILiquidityPool.sol";
import "../../external-interfaces/mai3/ILpGovernor.sol";

contract Mai3WorldMock is ILiquidityPool, ILpGovernor {
    using SafeMath for uint256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SafeERC20 for IERC20;

    address public _underlying;
    address public _mcb;
    address public _oracle;
    address public _shareToken;

    uint256 public _rewardRate;

    uint256 public _removePenaltyRate;

    mapping(address => uint256) public _earnedMCB;

    uint256 public constant EXP_SCALE = 1e18;

    constructor(uint256 rewardRate_, uint256 removePenaltyRate_) {
        _underlying = address(new Erc20Mock("underlying mock", "UNDERLYING", 18));
        _mcb = address(new Erc20Mock("MCB mock", "MCB", 18));
        _oracle = address(new Mai3OracleMock());
        _shareToken = address(new Erc20Mock("LP Share", "MAI3-LP", 18));

        _rewardRate = rewardRate_;
        setRemovePenaltyRate(removePenaltyRate_);
    }

    function setRewardRate(uint256 rewardRate_) external {
        _rewardRate = rewardRate_;
    }

    function setRemovePenaltyRate(uint256 removePenaltyRate_) public {
        require(removePenaltyRate_ < EXP_SCALE, "too large penlaty rate");
        _removePenaltyRate = removePenaltyRate_;
    }

    function forceToSyncState() external override {}

    function getLiquidityPoolInfo()
        external
        view
        override
        returns (
            bool isRunning,
            bool isFastCreationEnabled,
            // [0] creator,
            // [1] operator,
            // [2] transferringOperator,
            // [3] governor,
            // [4] shareToken,
            // [5] collateralToken,
            // [6] vault,
            address[7] memory addresses,
            int256 vaultFeeRate,
            int256 poolCash,
            // [0] collateralDecimals,
            // [1] perpetualCount
            // [2] fundingTime,
            // [3] operatorExpiration,
            uint256[4] memory nums
        )
    {
        addresses[3] = address(this);
        addresses[4] = _shareToken;
        addresses[5] = _underlying;
        return (true, true, addresses, 0, 0, nums);
    }

    function addLiquidity(int256 cashToAdd_) external override {
        uint256 beforeUnderlying = IERC20(_underlying).balanceOf(address(this));
        uint256 beforeShare = IERC20(_shareToken).totalSupply();

        if (beforeUnderlying == 0) {
            require(beforeShare == 0, "before share not zero");
            IERC20(_underlying).transferFrom(msg.sender, address(this), cashToAdd_.toUint256());
            Erc20Mock(_shareToken).mintMock(msg.sender, cashToAdd_.toUint256());
        } else {
            IERC20(_underlying).transferFrom(msg.sender, address(this), cashToAdd_.toUint256());
            uint256 afterUnderlying = beforeUnderlying.add(cashToAdd_.toUint256());
            uint256 deltaShare = afterUnderlying.mul(beforeShare).div(beforeUnderlying).sub(beforeShare);
            Erc20Mock(_shareToken).mintMock(msg.sender, deltaShare);
        }
    }

    function removeLiquidity(int256 shareToRemove_, int256 cashToReturn_) external override {
        (int256 shareToRemoveResult, int256 cashToReturnResult) = _queryRemoveLiquidity(shareToRemove_, cashToReturn_);
        require(cashToReturnResult > 0 && shareToRemoveResult > 0, "remove amount > 0");
        Erc20Mock(_shareToken).burnMock(msg.sender, shareToRemoveResult.toUint256());
        IERC20(_underlying).transfer(msg.sender, cashToReturnResult.toUint256());
    }

    function _queryRemoveLiquidity(int256 shareToRemove_, int256 cashToReturn_)
        internal
        view
        returns (int256 shareToRemoveResult, int256 cashToReturnResult)
    {
        require(shareToRemove_ == 0 || cashToReturn_ == 0, "one must be zero");
        uint256 beforeUnderlying = IERC20(_underlying).balanceOf(address(this));
        uint256 beforeShareSupply = IERC20(_shareToken).totalSupply();

        if (shareToRemove_ != 0) {
            uint256 shareToRemove = shareToRemove_.toUint256();
            uint256 cashToReturn =
                beforeUnderlying.mul(shareToRemove).div(beforeShareSupply).mul(EXP_SCALE.sub(_removePenaltyRate)).div(EXP_SCALE);
            return (shareToRemove_, cashToReturn.toInt256());
        } else {
            uint256 cashToReturn = cashToReturn_.toUint256();
            uint256 shareToRemove =
                cashToReturn.mul(EXP_SCALE).div(EXP_SCALE.sub(_removePenaltyRate)).mul(beforeShareSupply).div(beforeUnderlying);
            return (shareToRemove.toInt256(), cashToReturn_);
        }
    }

    function queryRemoveLiquidity(int256 shareToRemove_, int256 cashToReturn_)
        external
        view
        override
        returns (int256 shareToRemoveResult, int256 cashToReturnResult)
    {
        return _queryRemoveLiquidity(shareToRemove_, cashToReturn_);
    }

    function getPoolMargin() external view override returns (int256 poolMargin, bool isSafe) {
        return (IERC20(_underlying).balanceOf(address(this)).toInt256(), true);
    }

    function castVote(uint256 proposalId, bool support) external override {}

    function setEarned(address account, uint256 earned_) external {
        _earnedMCB[account] = earned_;
    }

    function earned(address account_) public view override returns (uint256) {
        return _earnedMCB[account_];
    }

    function getReward() external override {
        uint256 reward = earned(msg.sender);
        if (reward > 0) {
            Erc20Mock(_mcb).mintMock(msg.sender, reward);
        }
    }

    function rewardToken() external view override returns (address) {
        return _mcb;
    }

    function rewardRate() external view override returns (uint256) {
        return _rewardRate;
    }

    function increaseUnderlying(uint256 amount) external {
        Erc20Mock(_underlying).mintMock(address(this), amount);
    }

    function decreaseUnderlying(uint256 amount) external {
        Erc20Mock(_underlying).burnMock(address(this), amount);
    }

    function underlying() external view returns (address) {
        return _underlying;
    }

    function mcb() external view returns (address) {
        return _mcb;
    }

    function shareToken() external view returns (address) {
        return _shareToken;
    }

    function mcbOracle() external view returns (address) {
        return _oracle;
    }
}
