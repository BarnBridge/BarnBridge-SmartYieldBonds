// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../external-interfaces/aave/IAToken.sol";
import "./../external-interfaces/aave/ILendingPool.sol";
import "./../external-interfaces/aave/IStakedTokenIncentivesController.sol";

import "./AaveController.sol";

import "./IAaveCumulator.sol";
import "./../IProvider.sol";

contract AaveProvider is IProvider {
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

    // aave aToken
    address public cToken;

    bool public _setup;

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier onlySmartYield {
      require(
        msg.sender == smartYield,
        "AP: only smartYield"
      );
      _;
    }

    modifier onlyController {
      require(
        msg.sender == controller,
        "AP: only controller"
      );
      _;
    }

    modifier onlySmartYieldOrController {
      require(
        msg.sender == smartYield || msg.sender == controller,
        "AP: only smartYield/controller"
      );
      _;
    }

    modifier onlyControllerOrDao {
      require(
        msg.sender == controller || msg.sender == AaveController(controller).dao(),
        "AP: only controller/DAO"
      );
      _;
    }

    constructor(address aToken_)
    {
        cToken = aToken_;
        uToken = IAToken(aToken_).UNDERLYING_ASSET_ADDRESS();
    }

    function setup(
        address smartYield_,
        address controller_
    )
      external
    {
        require(
          false == _setup,
          "AP: already setup"
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
    function _takeUnderlying(address from_, uint256 underlyingAmount_)
      external override
      onlySmartYieldOrController
    {
        uint256 balanceBefore = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransferFrom(from_, address(this), underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(address(this));
        require(
          0 == (balanceAfter - balanceBefore - underlyingAmount_),
          "AP: _takeUnderlying amount"
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
          "AP: _sendUnderlying amount"
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

        IAaveCumulator(controller)._beforeCTokenBalanceChange();
        IERC20(uToken).safeApprove(address(IAToken(cToken).POOL()), underlyingAmount_);
        ILendingPool(IAToken(cToken).POOL()).deposit(uToken, underlyingAmount_, address(this), 0);
        IAaveCumulator(controller)._afterCTokenBalanceChange();
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

        IAaveCumulator(controller)._beforeCTokenBalanceChange();
        uint256 actualUnderlyingAmount = ILendingPool(IAToken(cToken).POOL()).withdraw(uToken, underlyingAmount_, address(this));
        require(actualUnderlyingAmount == underlyingAmount_, "AP: _withdrawProvider withdraw");
        IAaveCumulator(controller)._afterCTokenBalanceChange();
    }

    // claim "amount" of rewards we have accumulated and send them to "to" address
    // only callable by controller
    function claimRewardsTo(address[] calldata assets, uint256 amount, address to)
      external
      onlyController
      returns (uint256)
    {
      return IStakedTokenIncentivesController(IAToken(cToken).getIncentivesController()).claimRewards(
        assets,
        amount,
        to
      );
    }

    function transferFees()
      external
      override
    {
      _withdrawProviderInternal(underlyingFees, 0);
      underlyingFees = 0;

      uint256 fees = IERC20(uToken).balanceOf(address(this));
      address to = AaveController(controller).feesOwner();

      IERC20(uToken).safeTransfer(to, fees);

      emit TransferFees(msg.sender, to, fees);
    }

    // current total underlying balance, as measured by pool, without fees
    function underlyingBalance()
      external virtual override
    returns (uint256)
    {
        // https://docs.aave.com/developers/the-core-protocol/atokens#eip20-methods
        // total underlying balance minus underlyingFees
        return IAToken(cToken).balanceOf(address(this)).sub(underlyingFees);
    }
  // /externals
}
