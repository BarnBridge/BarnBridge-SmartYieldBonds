// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface ISmartYieldPool {
    // senior BONDs
    struct Bond {
        uint256 principal;
        uint256 gain;
        uint256 issuedAt;
        uint256 maturesAt;
        bool liquidated;
    }

    function buyBond(uint256 _principalAmount, uint16 _forDays)
        external
        returns (uint256);

    function redeemBond(uint256 _bondId) external;

    function liquidateBonds(uint256[] memory _bondIds) external;

    function buyTokens(uint256 _underlyingAmount) external;

    /**
     * sell all tokens instantly
     */
    function sellTokens(uint256 _jTokens) external;

    function withdrawTokensInitiate(uint256 _jTokens) external;

    function withdrawTokensFinalize() external;

    /**
     * token purchase price
     */
    function price() external view returns (uint256);

    function abondPaid() external view returns (uint256);

    function abondDebt() external view returns (uint256);

    function abondTotal() external view returns (uint256);

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external view returns (uint256);

    /**
     * @notice current underlying loanable, without accruing interest
     */
    function underlyingLoanable() external view returns (uint256);

    function underlyingJuniors() external view returns (uint256);

//    function claimTokenTotal() external view returns (uint256);

    function providerRatePerDay() external view returns (uint256);

    function bondGain(uint256 _principalAmount, uint16 _forDays)
        external
        view
        returns (uint256);

    function harvest() external;

    function underlyingDecimals() external view returns (uint256);
}
