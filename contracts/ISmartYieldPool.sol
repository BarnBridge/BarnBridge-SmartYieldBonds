// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO:
import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./compound-finance/CTokenInterfaces.sol";

import "./SeniorBondToken.sol";
import "./JuniorPoolToken.sol";

import "./Model/Bond/IBondSlippageModel.sol";
import "./Model/Token/ITokenPriceModel.sol";

interface ISmartYieldPool {
    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;
    uint256 public constant BOND_LIFE_MAX = 365 * 2; // in days
    uint256 public constant DAYS_IN_YEAR = 365;

    // DAI
    IERC20 public underlying;
    // cDAI
    CErc20Interface public cToken;
    // COMP
    IERC20 public rewardCToken;

    // senior BOND NFT
    SeniorBondToken public seniorBondToken;

    // junior POOL Token
    JuniorPoolToken public juniorToken;

    IBondSlippageModel public seniorModel;
    ITokenPriceModel public juniorModel;

    function buyBond(uint256 principalAmount, uint16 forDays) external;

    function redeemBond(uint256 _bondId) external;

    function buyToken(uint256 _underlying, uint256 _minTokens) external;

    function sellToken(uint256 _juniorTokens, uint256 _minUnderlying) external;

    function feeFor(uint256 _underlyingFeeable) external view returns (uint256);

    function bondGain(
        uint256 principalAmount,
        uint256 ratePerBlock,
        uint16 forDays
    ) external pure returns (uint256);

    /**
     * @notice computes the bondRate per block takeing into account the slippage
     * @return (the bondRate after slippage)
     */
    function bondRatePerBlockSlippage(uint256 addedPrincipalAmount)
        external
        view
        returns (uint256);

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external view returns (uint256);

    /**
     * @notice current underlying liquidity, without accruing interest
     */
    function underlyingLiquidity() external view returns (uint256);

    function claimTokenTotal() external view returns (uint256);

    function ratePerDay() external view returns (uint256);
}
