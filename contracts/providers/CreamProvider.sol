// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/math/MathUtils.sol";

import "./../external-interfaces/cream-finance/ICrCToken.sol";
import "./../external-interfaces/cream-finance/ICrComptroller.sol";

import "./../IController.sol";
import "./../IProvider.sol";

import "./ICreamCumulator.sol";

contract CreamProvider is IProvider {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

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
        "CrP: only smartYield"
      );
      _;
    }

    modifier onlyController {
      require(
        msg.sender == controller,
        "CrP: only controller"
      );
      _;
    }

    modifier onlySmartYieldOrController {
      require(
        msg.sender == smartYield || msg.sender == controller,
        "CrP: only smartYield/controller"
      );
      _;
    }

    modifier onlyControllerOrDao {
      require(
        msg.sender == controller || msg.sender == IController(controller).dao(),
        "CrP: only controller/DAO"
      );
      _;
    }

    constructor(address cToken_)
    {
        cToken = cToken_;
        uToken = ICrCToken(cToken_).underlying();
    }

    function setup(
        address smartYield_,
        address controller_
    )
      external
    {
        require(
          false == _setup,
          "CrP: already setup"
        );

        smartYield = smartYield_;
        controller = controller_;

        _enterMarket();

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
    function _takeUnderlying(address from_, uint256 underlyingAmount_)
      external override
      onlySmartYieldOrController
    {
        uint256 balanceBefore = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransferFrom(from_, address(this), underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(address(this));
        require(
          0 == (balanceAfter - balanceBefore - underlyingAmount_),
          "CrP: _takeUnderlying amount"
        );
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_)
      external override
      onlySmartYield
    {
        uint256 balanceBefore = IERC20(uToken).balanceOf(to_);
        IERC20(uToken).safeTransfer(to_, underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(to_);
        require(
          0 == (balanceAfter - balanceBefore - underlyingAmount_),
          "CrP: _sendUnderlying amount"
        );
    }

    // deposit underlyingAmount_ with the liquidity provider, callable by smartYield or controller
    function _depositProvider(uint256 underlyingAmount_, uint256 takeFees_)
      external override
      onlySmartYieldOrController
    {
        _depositProviderInternal(underlyingAmount_, takeFees_);
    }

    // deposit underlyingAmount_ with the liquidity provider, store resulting cToken balance in cTokenBalance
    function _depositProviderInternal(uint256 underlyingAmount_, uint256 takeFees_)
      internal
    {
        // underlyingFees += takeFees_
        underlyingFees = underlyingFees.add(takeFees_);

        ICreamCumulator(controller)._beforeCTokenBalanceChange();
        IERC20(uToken).safeApprove(address(cToken), underlyingAmount_);
        uint256 err = ICrCToken(cToken).mint(underlyingAmount_);
        require(0 == err, "CrP: _depositProvider mint");
        ICreamCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = IERC20(cToken).balanceOf(address(this));
    }

    // withdraw underlyingAmount_ from the liquidity provider, callable by smartYield
    function _withdrawProvider(uint256 underlyingAmount_, uint256 takeFees_)
      external override
      onlySmartYield
    {
      _withdrawProviderInternal(underlyingAmount_, takeFees_);
    }

    // withdraw underlyingAmount_ from the liquidity provider, store resulting cToken balance in cTokenBalance
    function _withdrawProviderInternal(uint256 underlyingAmount_, uint256 takeFees_)
      internal
    {
        // underlyingFees += takeFees_;
        underlyingFees = underlyingFees.add(takeFees_);

        ICreamCumulator(controller)._beforeCTokenBalanceChange();
        uint256 err = ICrCToken(cToken).redeemUnderlying(underlyingAmount_);
        require(0 == err, "CrP: _withdrawProvider redeemUnderlying");
        ICreamCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = IERC20(cToken).balanceOf(address(this));
    }

    // claims rewards we have accumulated and sends them to "to" address
    // only callable by controller
    function claimRewardsTo(uint256 amount, address to)
      external
      onlyController
      returns (uint256)
    {
      address[] memory holders = new address[](1);
      holders[0] = address(this);

      address[] memory cTokens = new address[](1);
      cTokens[0] = cToken;

      ICrComptroller comptroller = ICrComptroller(ICrCToken(cToken).comptroller());
      IERC20 Comp = IERC20(comptroller.getCompAddress());

      comptroller.claimComp(
        holders,
        cTokens,
        false,
        true
      );

      amount = MathUtils.min(amount, Comp.balanceOf(address(this)));

      Comp.safeTransfer(to, amount);

      return amount;
    }

    function transferFees()
      external
      override
    {
      _withdrawProviderInternal(underlyingFees, 0);
      underlyingFees = 0;

      uint256 fees = IERC20(uToken).balanceOf(address(this));
      address to = IController(controller).feesOwner();

      IERC20(uToken).safeTransfer(to, fees);

      emit TransferFees(msg.sender, to, fees);
    }

    // current total underlying balance, as measured by pool, without fees
    function underlyingBalance()
      external virtual override
    returns (uint256)
    {
        // https://compound.finance/docs#protocol-math
        // (total balance in underlying) - underlyingFees
        // cTokenBalance * exchangeRateCurrent() / EXP_SCALE - underlyingFees;
        return cTokenBalance.mul(exchangeRateCurrent()).div(EXP_SCALE).sub(underlyingFees);
    }
  // /externals

  // public
    // get exchangeRateCurrent from cream and cache it for the current block
    function exchangeRateCurrent()
      public virtual
    returns (uint256)
    {
      // only once per block
      if (block.timestamp > exchangeRateCurrentCachedAt) {
        exchangeRateCurrentCachedAt = block.timestamp;
        exchangeRateCurrentCached = ICrCToken(cToken).exchangeRateCurrent();
      }
      return exchangeRateCurrentCached;
    }
  // /public

  // internals

    // call comptroller.enterMarkets()
    // needs to be called only once BUT before any interactions with the provider
    function _enterMarket()
      internal
    {
        address[] memory markets = new address[](1);
        markets[0] = cToken;
        uint256[] memory err = ICrComptroller(ICrCToken(cToken).comptroller()).enterMarkets(markets);
        require(err[0] == 0, "CrP: _enterMarket");
    }

    // /internals

}
