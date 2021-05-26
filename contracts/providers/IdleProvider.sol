// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "./../lib/uniswap/UniswapV2Library.sol";
import "./../lib/uniswap/UniswapV2OracleLibrary.sol";
import "./../external-interfaces/uniswap/IUniswapV2Router.sol";
import "./../external-interfaces/idle/IIdleToken.sol";

import "../IProvider.sol";
import "./IdleController.sol";
import "./IIdleCumulator.sol";

contract IdleProvider is IProvider {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public referral;
    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant EXP_SCALE = 1e18;
    address public constant UNISWAP_ROUTER_V2 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

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

    address[] public govTokens;

    mapping(address=>address[]) public uniswapPaths;

    event TransferFees(address indexed caller, address indexed feesOwner, uint256 fees);

    modifier onlySmartYield {
      require(
        msg.sender == smartYield,
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

    modifier onlySmartYieldOrController {
      require(
        msg.sender == smartYield || msg.sender == controller,
        "PPC: only smartYield/controller"
      );
      _;
    }

    modifier onlyControllerOrDao {
      require(
        msg.sender == controller || msg.sender == IdleController(controller).dao(),
        "PPC: only controller/DAO"
      );
      _;
    }

    constructor(address cToken_) {
        cToken = cToken_;
        //uToken = uToken_;
        uToken = IIdleToken(cToken_).token();
        //updateGovTokensList();
        //setUniswapPathsAndApprove();
    }

    function setup(
        address smartYield_,
        address controller_
    ) external {
        require(
          false == _setup,
          "PPC: already setup"
        );

        smartYield = smartYield_;
        controller = controller_;

        //_enterMarket();

        //updateGovTokensList();
        //setUniswapPathsAndApprove();

        updateAllowances();

        _setup = true;
    }

    function setController(address newController_)
      external override
      onlyControllerOrDao
    {
      // remove allowance on old controller
      for (uint i=0; i<govTokens.length; i++) {
          IERC20(govTokens[i]).safeApprove(controller, 0);
      }

      controller = newController_;

      // give allowance to new controler
      updateAllowances();
    }

    function updateAllowances() public {
        //IERC20 rewardToken = IERC20(IComptroller(ICToken(cToken).comptroller()).getCompAddress());

        uint256 controllerRewardAllowance;
        for (uint i=0; i<govTokens.length; i++) {
            controllerRewardAllowance = IERC20(govTokens[i]).allowance(address(this), controller);
            IERC20(govTokens[i]).safeIncreaseAllowance(controller, MAX_UINT256.sub(controllerRewardAllowance));
        }
        //uint256 controllerRewardAllowance = rewardToken.allowance(address(this), controller);
        //rewardToken.safeIncreaseAllowance(controller, MAX_UINT256.sub(controllerRewardAllowance));
    }

  // externals

    // take underlyingAmount_ from from_
    function _takeUnderlying(address from_, uint256 underlyingAmount_) external override onlySmartYieldOrController {
        uint256 balanceBefore = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransferFrom(from_, address(this), underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(address(this));
        require(
            0 == (balanceAfter - balanceBefore - underlyingAmount_),
            "PPC: _takeUnderlying amount"
        );
    }

    // transfer away underlyingAmount_ to to_
    function _sendUnderlying(address to_, uint256 underlyingAmount_) external override onlySmartYield {
        uint256 balanceBefore = IERC20(uToken).balanceOf(to_);
        IERC20(uToken).safeTransfer(to_, underlyingAmount_);
        uint256 balanceAfter = IERC20(uToken).balanceOf(to_);
        require(
          0 == (balanceAfter - balanceBefore - underlyingAmount_),
          "PPC: _sendUnderlying amount"
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

        //ICompoundCumulator(controller)._beforeCTokenBalanceChange();
        IIdleCumulator(controller)._beforeCTokenBalanceChange();
        //uint256 err = ICToken(cToken).redeemUnderlying(underlyingAmount_);
        //require(0 == err, "PPC: _withdrawProvider redeemUnderlying");
        IIdleToken(cToken).redeemIdleToken(underlyingAmount_);
        convertGovTokensToUnderlying();
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
        // https://compound.finance/docs#protocol-math
        // (total balance in underlying) - underlyingFees
        // cTokenBalance * exchangeRateCurrent() / EXP_SCALE - underlyingFees;
        return cTokenBalance.mul(exchangeRateCurrent()).div(EXP_SCALE).sub(underlyingFees);
    }

    function setUniswapPathsAndApprove() internal {
        address[] memory rewardTokens = IIdleToken(cToken).getGovTokens();
        for (uint i=0; i<rewardTokens.length; i++) {
            address[] memory path = new address[](3);
            path[0] = rewardTokens[i];
            path[1] = WETH;
            path[2] = uToken;
            uniswapPaths[rewardTokens[i]] = path;
            require(IERC20(rewardTokens[i]).approve(address(UNISWAP_ROUTER_V2), MAX_UINT256), 'approve failed.');
        }
    }

    function convertGovTokensToUnderlying() internal {
        for (uint i=0; i<govTokens.length; i++) {
            IUniswapV2Router(UNISWAP_ROUTER_V2).
            swapExactTokensForTokens(IERC20(govTokens[i]).balanceOf(address(this)),
            0, uniswapPaths[govTokens[i]], msg.sender, block.timestamp);
        }
    }

    function controllerRedeemGovTokens() external onlyController {
        IIdleToken(cToken).redeemIdleToken(0);
    }
  // /externals

  // public
    // get exchangeRateCurrent from compound and cache it for the current block
    function exchangeRateCurrent() public virtual returns (uint256) {
      // only once per block
      if (block.timestamp > exchangeRateCurrentCachedAt) {
        exchangeRateCurrentCachedAt = block.timestamp;
        exchangeRateCurrentCached = IIdleToken(cToken).tokenPriceWithFee(address(this));
      }
      return exchangeRateCurrentCached;
    }

    /* function updateGovTokensList() public {
        uint256 govTokensLength = IIdleToken(cToken).getGovTokensAmounts(address(1)).length;
        delete govTokens;

        for (uint i=0; i<govTokensLength; i++) {
            govTokens.push(IIdleToken(cToken).govTokens(i));
        }
        setUniswapPathsAndApprove();
        address[] memory govTokens_ = IIdleToken(cToken).getGovTokens();


    } */

    function getGovTokens() public view returns (address[] memory) {
        return IIdleToken(cToken).getGovTokens();
    }

    function uniswapRouter() public view virtual returns(address) {
        // mockable
        return UNISWAP_ROUTER_V2;
    }

    function getUniswapPath(address token) public view returns (address[] memory) {
        return uniswapPaths[token];
    }
}
