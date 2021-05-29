// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
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

contract IdleController is IController, IIdleCumulator, IYieldOraclelizable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public constant UNISWAP_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant UNISWAP_ROUTER_V2 = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

    uint256 public constant MAX_UINT256 = uint256(-1);
    uint256 public constant DOUBLE_SCALE = 1e36;

    uint256 public constant BLOCKS_PER_DAY = 5760; // 4 * 60 * 24 (assuming 4 blocks per minute)

    address public uToken;
    address public cToken;

    uint256 public harvestedLast;
    address public rewardsCollector;
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
      address bondModel_,
      address rewardsCollector_
    )
      IController()
    {
      pool = pool_;
      smartYield = smartYield_;
      rewardsCollector = rewardsCollector_;
      uToken = IdleProvider(pool).uToken();
      cToken = IdleProvider(pool).cToken();
      underlyingDecimals = ERC20(uToken).decimals();
      //setUniswapPaths(pool_);
      setBondModel(bondModel_);
      updateAllowances();
    }

    function updateAllowances() public {
        address[] memory rewardTokens = IIdleToken(cToken).getGovTokens();
        uint256 routerRewardAllowance;
        uint256 rewardTokensLength = rewardTokens.length;
        for (uint i=0; i<rewardTokensLength; i++) {
            routerRewardAllowance = IERC20(rewardTokens[i]).allowance(address(this), uniswapRouter());
            IERC20(rewardTokens[i]).safeIncreaseAllowance(uniswapRouter(), MAX_UINT256.sub(routerRewardAllowance));
        }
        uint256 poolUnderlyingAllowance = IERC20(uToken).allowance(address(this), address(pool));
        IERC20(uToken).safeIncreaseAllowance(address(pool), MAX_UINT256.sub(poolUnderlyingAllowance));
    }

    function uniswapRouter() public view virtual returns(address) {
        // mockable
        return UNISWAP_ROUTER_V2;
    }

    function _beforeCTokenBalanceChange() external override onlyPool {}

    function _afterCTokenBalanceChange(uint256 prevCTokenBalance_) external override onlyPool {
        // at this point compound.finance state is updated since the pool did a deposit or withdrawl just before, so no need to ping
        updateCumulativesInternal(prevCTokenBalance_, false);
        IYieldOracle(oracle).update();
    }

    function updateCumulativesInternal(uint256 val, bool pingIdle_) internal {
        uint256 timeElapsed = block.timestamp - prevCumulationTime;

        // only cumulate once per block
        if (0 == timeElapsed) {
            return;
        }

        uint256 exchangeRateStoredNow = IIdleToken(cToken).tokenPriceWithFee(address(pool));

        if (prevExchangeRateCurrent > 0) {
          // cumulate a new supplyRate delta: cumulativeSupplyRate += (cToken.exchangeRateCurrent() - prevExchnageRateCurrent) / prevExchnageRateCurrent
          // cumulativeSupplyRate eventually overflows, but that's ok due to the way it's used in the oracle
          cumulativeSupplyRate += exchangeRateStoredNow.sub(prevExchangeRateCurrent).mul(EXP_SCALE).div(prevExchangeRateCurrent);
        }

        prevCumulationTime = block.timestamp;

        // exchangeRateStored can increase multiple times per block
        prevExchangeRateCurrent = exchangeRateStoredNow;
    }

    function providerRatePerDay() public override returns (uint256) {
        if (IYieldOracle(oracle).consult(1 days) == 0) {
            return MathUtils.min(BOND_MAX_RATE_PER_DAY, spotDailyRate());
        }
        return MathUtils.min(
            MathUtils.min(BOND_MAX_RATE_PER_DAY, spotDailyRate()),
            IYieldOracle(oracle).consult(1 days)
        );
    }

    function cumulatives() public override returns (uint256) {
        uint256 timeElapsed = block.timestamp - prevCumulationTime;
        // only cumulate once per block
        if (0 == timeElapsed) {
          return cumulativeSupplyRate;
        }
        uint256 cTokenBalance = IdleProvider(pool).cTokenBalance();
        updateCumulativesInternal(cTokenBalance, false);
        return cumulativeSupplyRate;
    }

    function cTokensToUnderlying(uint256 cTokens_, uint256 exchangeRate_) public pure returns (uint256) {
      return cTokens_.mul(exchangeRate_).div(EXP_SCALE);
    }

    function harvest(uint256) public returns (uint256 rewardAmountGot, uint256 underlyingHarvestReward) {
        require(
          harvestedLast < block.timestamp,
          "PPC: harvest later"
        );

        address[] memory govTokens = IdleProvider(pool).getGovTokens();

        address caller = msg.sender;

        //redeem gov tokens from idle
        IdleProvider(pool).controllerRedeemGovTokens();
        address[] memory uniswapPath;
        uint256 govTokenAmount;
        for (uint i=0; i<govTokens.length; i++) {
            //transfer all gov token from pool to self
            govTokenAmount = IERC20(govTokens[i]).balanceOf(pool);
            IERC20(govTokens[i]).safeTransferFrom(pool, address(this), govTokenAmount);
            //sell all gov tokens on uniswap
            uniswapPath = IdleProvider(pool).getUniswapPath(govTokens[i]);
            //require(IERC20(govTokens[i]).approve(address(UNISWAP_ROUTER_V2), govTokenAmount), 'approve failed.');

            IUniswapV2Router(uniswapRouter()).
            swapExactTokensForTokens(IERC20(govTokens[i]).balanceOf(address(this)),
            0, uniswapPath, address(this), block.timestamp);
        }

        uint256 totalRewards = IERC20(uToken).balanceOf(address(this));

        uint256 poolShare = MathUtils.fractionOf(
          totalRewards,
          EXP_SCALE.sub(HARVEST_COST)
        );

        //IERC20(IdleProvider(pool).uToken()).balanceOf(address(this))

        // deposit pool reward share with liquidity provider
        IdleProvider(pool)._takeUnderlying(address(this), poolShare);
        IdleProvider(pool)._depositProvider(poolShare, 0);

        // pay caller
        uint256 callerReward = IERC20(uToken).balanceOf(address(this));
        IERC20(uToken).safeTransfer(caller, callerReward);

        harvestedLast = block.timestamp;

        emit Harvest(caller, totalRewards, totalRewards, poolShare, callerReward, HARVEST_COST);

        return (totalRewards, callerReward);
    }

    /* function harvest(uint256)
      public
    returns (uint256 rewardAmountGot, uint256 underlyingHarvestReward)
    {
        uint256 amountRewarded = IdleProvider(pool).claimRewardsTo(MAX_UINT256, rewardsCollector);

        emit Harvest(msg.sender, amountRewarded, 0, 0, 0, HARVEST_COST);
        return (amountRewarded, 0);
    } */

    function spotDailySupplyRateProvider() public view returns (uint256) {
        return (IIdleToken(cToken).getAvgAPR()).div(36525);
    }

    function spotDailyDistributionRateProvider() public view returns (uint256) {
        return 0;
    }

    function spotDailyRate() public view returns (uint256) {
        return spotDailySupplyRateProvider().add(spotDailySupplyRateProvider());
    }

}
