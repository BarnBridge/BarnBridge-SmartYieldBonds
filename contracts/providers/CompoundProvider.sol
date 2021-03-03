// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./../external-interfaces/compound-finance/ICToken.sol";
import "./../external-interfaces/compound-finance/IComptroller.sol";

import "./../lib/math/MathUtils.sol";

import "./CompoundController.sol";

import "./../IController.sol";
import "./ICompoundCumulator.sol";
import "./../oracle/IYieldOracle.sol";
import "./../IProvider.sol";

contract CompoundProvider is IProvider {
    using SafeMath for uint256;

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

    bool public _setup;

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier onlySmartYield {
      require(
        msg.sender == smartYield,
        "PPC: only smartYield"
      );
      _;
    }

    modifier onlySmartYieldOrController {
      require(
        msg.sender == smartYield || msg.sender == controller,
        "PPC: only smartYield"
      );
      _;
    }

    modifier onlyController {
      require(
        msg.sender == controller,
        "PPC: only controller"
      );
      _;
    }

    function setup(
        address smartYield_,
        address controller_,
        address cToken_
    )
      external
    {
        require(
          false == _setup,
          "PPC: already setup"
        );

        smartYield = smartYield_;
        controller = controller_;
        cToken = cToken_;
        uToken = ICToken(cToken_).underlying();

        _enterMarket();

        _setup = true;
    }

  // externals

    // take underlyingAmount_ from from_
    function _takeUnderlying(address from_, uint256 underlyingAmount_)
      external override
      onlySmartYield
    {
        require(
            underlyingAmount_ <= IERC20(uToken).allowance(from_, address(this)),
            "PPC: _takeUnderlying allowance"
        );
        require(
            IERC20(uToken).transferFrom(from_, address(this), underlyingAmount_),
            "PPC: _takeUnderlying transferFrom"
        );
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_)
      external override
      onlySmartYield
      returns (bool)
    {
        return IERC20(uToken).transfer(to_, underlyingAmount_);
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
        underlyingFees += takeFees_;

        ICompoundCumulator(controller)._beforeCTokenBalanceChange();
        IERC20(uToken).approve(address(cToken), underlyingAmount_);
        uint256 err = ICToken(cToken).mint(underlyingAmount_);
        require(0 == err, "PPC: _depositProvider mint");
        ICompoundCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = ICTokenErc20(cToken).balanceOf(address(this));
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
        underlyingFees += takeFees_;

        ICompoundCumulator(controller)._beforeCTokenBalanceChange();
        uint256 err = ICToken(cToken).redeemUnderlying(underlyingAmount_);
        require(0 == err, "PPC: _withdrawProvider redeemUnderlying");
        ICompoundCumulator(controller)._afterCTokenBalanceChange(cTokenBalance);

        // cTokenBalance is used to compute the pool yield, make sure no one interferes with the computations between deposits/withdrawls
        cTokenBalance = ICTokenErc20(cToken).balanceOf(address(this));
    }

    function transferFees()
      external
      override
    {
      _withdrawProviderInternal(underlyingFees, 0);
      underlyingFees = 0;

      uint256 fees = IERC20(uToken).balanceOf(address(this));
      address to = IController(controller).feesOwner();

      IERC20(uToken).transfer(to, fees);

      emit TransferFees(msg.sender, to, fees);
    }

    // current total underlying balance, as measured by pool
    function underlyingBalance()
      external view virtual override
    returns (uint256)
    {
        // https://compound.finance/docs#protocol-math
        return
            cTokenBalance * ICToken(cToken).exchangeRateStored() / 1e18;
    }

  // /externals

  // internals

    // call comptroller.enterMarkets()
    // needs to be called only once BUT before any interactions with the provider
    function _enterMarket()
      internal
    {
        address[] memory markets = new address[](1);
        markets[0] = cToken;
        uint256[] memory err = IComptroller(ICToken(cToken).comptroller()).enterMarkets(markets);
        require(err[0] == 0, "PPC: _enterMarket");
    }

    // /internals

}
