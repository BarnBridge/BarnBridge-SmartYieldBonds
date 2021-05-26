// SPDX-License-Identifier: Apache-2.0

pragma solidity 0.7.6;

interface IIdleToken {
    function token() external returns (address underlying);
    function govTokens(uint256) external returns (address govToken);
    function userAvgPrices(address) external returns (uint256 avgPrice);
    function mintIdleToken(uint256 _amount, bool _skipWholeRebalance, address _referral) external returns (uint256 mintedTokens);
    function redeemIdleToken(uint256 _amount) external returns (uint256 redeemedTokens);
    function redeemInterestBearingTokens(uint256 _amount) external;
    function rebalance() external returns (bool);
    function tokenPrice() external view returns (uint256 price);
    function getAPRs() external view returns (address[] memory addresses, uint256[] memory aprs);
    function getAvgAPR() external view returns (uint256 avgApr);
    function getGovTokensAmounts(address _usr) external view returns (uint256[] memory _amounts);
    function flashLoanFee() external view returns (uint256 fee);
    function flashFee(address _token, uint256 _amount) external view returns (uint256);
    function maxFlashLoan(address _token) external view returns (uint256);
    //function flashLoan(IERC3156FlashBorrower _receiver, address _token, uint256 _amount, bytes calldata _params) external returns (bool);
    function getAllocations() external view returns (uint256[] memory);
    function getGovTokens() external view returns (address[] memory);
    function getAllAvailableTokens() external view returns (address[] memory);
    function getProtocolTokenToGov(address _protocolToken) external view returns (address);
    function tokenPriceWithFee(address user) external view returns (uint256 priceWFee);
}
