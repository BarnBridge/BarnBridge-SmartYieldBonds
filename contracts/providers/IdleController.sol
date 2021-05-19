// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import "./../lib/uniswap/UniswapV2Library.sol";
import "./../lib/uniswap/UniswapV2OracleLibrary.sol";
import "./../external-interfaces/uniswap/IUniswapV2Router.sol";
import "./../lib/uniswap/FixedPoint.sol";
import "./../lib/math/MathUtils.sol";
import "./../external-interfaces/idle/IIdleToken.sol";
import "./IIdleCumulator.sol";
import "../IController.sol";
import "./../oracle/IYieldOracle.sol";
import "./../oracle/IYieldOraclelizable.sol";
import "./IdleProvider.sol";
//import "hardhat/console.sol";

contract IdleController is IController, IIdleCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant UNISWAP_ROUTER_V2 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant DOUBLE_SCALE = 1e36;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    uint256 public harvestedLast;

    // last time we cumulated
    uint256 public prevCumulationTime;

    // exchangeRateStored last time we cumulated
    uint256 public prevExchangeRateCurrent;

    // cumulative supply rate += ((new underlying) / underlying)
    uint256 public cumulativeSupplyRate;

    // cumulative COMP distribution rate += ((new underlying) / underlying)
    uint256 public cumulativeDistributionRate;

    // compound.finance comptroller.compSupplyState right after the previous deposit/withdraw
    //IComptroller.CompMarketState public prevCompSupplyState; //TODO

    uint256 public underlyingDecimals;

    // uniswap path for Gov tokens to underlying
    //mapping(address=>address[]) public uniswapPaths;

    event Harvest(address indexed caller, uint256 compRewardTotal, uint256 compRewardSold, uint256 underlyingPoolShare, uint256 underlyingReward, uint256 harvestCost); //TODO


    modifier onlyPool {
      require(
        msg.sender == pool,
        "CC: only pool"
      );
      _;
    }

    constructor(
      address pool_,
      address smartYield_,
      address bondModel_
    )
      IController()
    {
      pool = pool_;
      smartYield = smartYield_;
      //underlyingDecimals = ERC20(ICToken(CompoundProvider(pool).cToken()).underlying()).decimals();
      underlyingDecimals = 18;
      //setUniswapPaths(pool_);
      setBondModel(bondModel_);
      updateAllowances();
    }

    function updateAllowances() public {
        IIdleToken cToken = IIdleToken(IdleProvider(pool).cToken());
        address[] memory rewardTokens = IdleProvider(pool).getGovTokens();
        IERC20 uToken = IERC20(IdleProvider(pool).uToken());
        uint256 routerRewardAllowance;
        for (uint i=0; i<rewardTokens.length; i++) {
            routerRewardAllowance = IERC20(rewardTokens[i]).allowance(address(this), uniswapRouter());
            IERC20(rewardTokens[i]).safeIncreaseAllowance(uniswapRouter(), MAX_UINT256.sub(routerRewardAllowance));
        }
        uint256 poolUnderlyingAllowance = uToken.allowance(address(this), address(pool));
        uToken.safeIncreaseAllowance(address(pool), MAX_UINT256.sub(poolUnderlyingAllowance));
    }

    function uniswapRouter() public view virtual returns(address) {
        // mockable
        return UNISWAP_ROUTER_V2;
    }

    function _beforeCTokenBalanceChange() external override onlyPool {}

    function _afterCTokenBalanceChange(uint256 prevCTokenBalance_) external override onlyPool {
        // at this point compound.finance state is updated since the pool did a deposit or withdrawl just before, so no need to ping
        //updateCumulativesInternal(prevCTokenBalance_, false);
        IYieldOracle(oracle).update();
    }

    /* function updateCumulativesInternal(uint256 val, bool val2) internal {

    } */

    function providerRatePerDay() public override returns (uint256) {
        if (IYieldOracle(oracle).consult(1 days) == 0) {
            return MathUtils.min(BOND_MAX_RATE_PER_DAY, (IIdleToken(IdleProvider(pool).cToken()).getAvgAPR()).div(365));
        }
        else {
            return MathUtils.min(
            MathUtils.min(BOND_MAX_RATE_PER_DAY, (IIdleToken(IdleProvider(pool).cToken()).getAvgAPR()).div(365)),
            IYieldOracle(oracle).consult(1 days));
        }
    }

    function cumulatives() public override returns (uint256) {
        uint256 apr = IIdleToken(IdleProvider(pool).cToken()).getAvgAPR();
        return apr;
    }

    function cTokensToUnderlying(
      uint256 cTokens_, uint256 exchangeRate_
    ) public pure returns (uint256) {
      return cTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

}
