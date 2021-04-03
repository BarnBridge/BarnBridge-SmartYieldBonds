// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

interface ILiquidityPool {
    /**
     * @notice  If you want to get the real-time data, call this function first
     */
    function forceToSyncState() external;

    /**
     * @notice Get the info of the liquidity pool
     * @return isRunning True if the liquidity pool is running
     * @return isFastCreationEnabled True if the operator of the liquidity pool is allowed to create new perpetual
     *                               when the liquidity pool is running
     * @return addresses The related addresses of the liquidity pool
     * @return vaultFeeRate The vault fee rate of the liquidity pool
     * @return poolCash The pool cash(collateral) of the liquidity pool
     * @return nums Uint type properties, see below for details.
     */
    function getLiquidityPoolInfo()
        external
        view
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
        );

    /**
     * @notice  Add liquidity to the liquidity pool.
     *          Liquidity provider deposits collaterals then gets share tokens back.
     *          The ratio of added cash to share token is determined by current liquidity.
     *
     * @param   cashToAdd   The amount of cash to add. always use decimals 18.
     */
    function addLiquidity(int256 cashToAdd) external;

    /**
     * @notice  Remove liquidity from the liquidity pool.
     *          Liquidity providers redeems share token then gets collateral back.
     *          The amount of collateral retrieved may differ from the amount when adding liquidity,
     *          The index price, trading fee and positions holding by amm will affect the profitability of providers.
     *          Can only called when the pool is running.
     *
     * @param   shareToRemove  The amount of share token to remove
     * @param   cashToReturn   The amount of cash(collateral) to return
     */
    function removeLiquidity(int256 shareToRemove, int256 cashToReturn) external;

    /**
     * @notice  Query cash to return / share to redeem when removing liquidity from the liquidity pool.
     *          Only one of shareToRemove or cashToReturn may be non-zero.
     *
     * @param   cashToReturn        The amount of cash to return, always use decimals 18.
     * @param   shareToRemove       The amount of share token to redeem, always use decimals 18.
     * @return  cashToReturnResult The amount of share token to redeem, always use decimals 18. Equal to shareToRemove if shareToRemove is non-zero.
     * @return  shareToRemoveResult  The amount of cash to return, always use decimals 18. Equal to cashToReturn if cashToReturn is non-zero.
     */
    function queryRemoveLiquidity(int256 shareToRemove, int256 cashToReturn)
        external
        view
        returns (int256 cashToReturnResult, int256 shareToRemoveResult);

    /**
     * @notice Get the pool margin of the liquidity pool.
     *         Pool margin is how much collateral of the pool considering the AMM's positions of perpetuals
     * @return poolMargin The pool margin of the liquidity pool
     */
    function getPoolMargin() external view returns (int256 poolMargin, bool isSafe);
}
