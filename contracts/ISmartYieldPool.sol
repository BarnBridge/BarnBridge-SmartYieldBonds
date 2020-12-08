// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

interface ISmartYieldPool {

    // senior BONDs
    struct Bond {
        uint256 principal;
        uint256 gain;
        uint256 issuedAt;
        uint256 maturesAt;
    }

    function buyBond(uint256 principalAmount, uint16 forDays) external returns (uint256);

    function redeemBond(uint256 _bondId) external;

    function buyToken(uint256 _underlying) external;

    function sellToken(uint256 _juniorTokens, uint256 _minUnderlying) external;

    function feeFor(uint256 _underlyingFeeable) external view returns (uint256);

    /**
     * @notice computes the bondRate per block takeing into account the slippage
     * @return (the bondRate after slippage)
     */
    function bondRate(uint256 principalAmount, uint16 forDays)
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

    function underlyingJunior()  external view returns (uint256);

    function claimTokenTotal() external view returns (uint256);

    function ratePerDay() external view returns (uint256);
}
