// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./../external-interfaces/idle/IIdleToken.sol";

import "../IProvider.sol";
import "./IdleController.sol";
import "./IIdleCumulator.sol";

contract IdleProvider is IProvider {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public referral = 0x4cAE362D7F227e3d306f70ce4878E245563F3069;
    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant EXP_SCALE = 1e18;

    address public override smartYield;

    address public override controller;

    // fees colected in underlying
    uint256 public override underlyingFees;

    // underlying token (ie. DAI)
    address public uToken; // IERC20

    // claim token (ie. cDAI)
    address public cToken;

    // cToken.balanceOf(this) measuring only deposits by users (excludes direct cToken transfers to pool)
    uint256 public cTokenBalance;

    uint256 public exchangeRateCurrentCached;
    uint256 public exchangeRateCurrentCachedAt;

    bool public _setup;

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier onlySmartYield {
      require(
        msg.sender == smartYield,
        "IP: only smartYield"
      );
      _;
    }

    modifier onlyController {
      require(
        msg.sender == controller,
        "IP: only controller"
      );
      _;
    }

    modifier onlySmartYieldOrController {
      require(
        msg.sender == smartYield || msg.sender == controller,
        "IP: only smartYield/controller"
      );
      _;
    }

    modifier onlyControllerOrDao {
      require(
        msg.sender == controller || msg.sender == IdleController(controller).dao(),
        "IP: only controller/DAO"
      );
      _;
    }

    constructor(address cToken_) {
        cToken = cToken_;
        uToken = IIdleToken(cToken_).token();
    }

    function setup(
        address smartYield_,
        address controller_
    ) external {
        require(
          false == _setup,
          "IP: already setup"
        );

        smartYield = smartYield_;
        controller = controller_;

        _setup = true;
    }

    function setController(address newController_)
      external override
      onlyControllerOrDao
    {
      controller = newController_;
    }

  // externals

    // take underlyingAmount_ from from_
    function _takeUnderlying(address from_, uint256 underlyingAmount_) external override onlySmartYieldOrController {
        uint256 balanceBefore = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransferFrom(from_, address(this), underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(address(this));
        require(
            0 == (balanceAfter - balanceBefore - underlyingAmount_),
            "IP: _takeUnderlying amount"
        );
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_) external override onlySmartYield {
        uint256 balanceBefore = IERC20(uToken).balanceOf(to_);
        IERC20(uToken).safeTransfer(to_, underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(to_);
        require(
          0 == (balanceAfter - balanceBefore - underlyingAmount_),
          "IP: _sendUnderlying amount"
        );
    }

    // deposit underlyingAmount_ with the liquidity provider, callable by smartYield or controller
    function _depositProvider(uint256 underlyingAmount_, uint256 takeFees_) external override onlySmartYieldOrController {
        _depositProviderInternal(underlyingAmount_, takeFees_);
    }

    // deposit underlyingAmount_ with the liquidity provider, store resulting cToken balance in cTokenBalance
    function _depositProviderInternal(uint256 underlyingAmount_, uint256 takeFees_) internal {
        // underlyingFees += takeFees_
        underlyingFees = underlyingFees.add(takeFees_);

        IIdleCumulator(controller)._beforeCTokenBalanceChange();
        IERC20(uToken).approve(address(cToken), underlyingAmount_);

        IIdleToken(cToken).mintIdleToken(underlyingAmount_, true, referral);
        IIdleCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = IERC20(cToken).balanceOf(address(this));
    }

    // withdraw underlyingAmount_ from the liquidity provider, callable by smartYield
    function _withdrawProvider(uint256 underlyingAmount_, uint256 takeFees_) external override onlySmartYield {
        _withdrawProviderInternal(underlyingAmount_, takeFees_);
    }

    // withdraw underlyingAmount_ from the liquidity provider, store resulting cToken balance in cTokenBalance
    function _withdrawProviderInternal(uint256 underlyingAmount_, uint256 takeFees_) internal {
        // underlyingFees += takeFees_;
        underlyingFees = underlyingFees.add(takeFees_);

        IIdleCumulator(controller)._beforeCTokenBalanceChange();

        IIdleToken(cToken).redeemIdleToken(underlyingAmount_);

        IIdleCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = IERC20(cToken).balanceOf(address(this));
    }

    function transferFees() external override {
        _withdrawProviderInternal(underlyingFees, 0);
        underlyingFees = 0;

        uint256 fees = IERC20(uToken).balanceOf(address(this));
        address to = IdleController(controller).feesOwner();

        IERC20(uToken).safeTransfer(to, fees);
        emit TransferFees(msg.sender, to, fees);
    }

    // current total underlying balance, as measured by pool, without fees
    function underlyingBalance() external virtual override returns (uint256) {
        return cTokenBalance.mul(exchangeRateCurrent()).div(EXP_SCALE).sub(underlyingFees);
    }

    function controllerRedeemGovTokens() external onlyController {
        IIdleToken(cToken).redeemIdleToken(0);
    }
  // /externals

  // public
    function exchangeRateCurrent() public virtual returns (uint256) {
      // only once per block
      if (block.timestamp > exchangeRateCurrentCachedAt) {
        exchangeRateCurrentCachedAt = block.timestamp;
        exchangeRateCurrentCached = IIdleToken(cToken).tokenPriceWithFee(address(this));
      }
      return exchangeRateCurrentCached;
    }

    function claimRewardsTo(uint256 amount, address to)
      external
      onlyController
      returns (address[] memory, uint256[] memory, uint256[] memory) {

      IIdleToken(cToken).redeemIdleToken(0);
      address[] memory govTokens = IIdleToken(cToken).getGovTokens();
      uint256 govTokensLength = govTokens.length;
      uint256[] memory rewardAmount = new uint256[](govTokensLength);
      uint256[] memory rewardSold = new uint256[](govTokensLength);
      for (uint256 i = 0; i < govTokensLength; i++) {
          rewardAmount[i] = IERC20(govTokens[i]).balanceOf(address(this));
          rewardSold[i] = 0;
          IERC20(govTokens[i]).safeTransfer(to, IERC20(govTokens[i]).balanceOf(address(this)));
      }
      return (govTokens, rewardAmount, rewardSold);
    }
}
