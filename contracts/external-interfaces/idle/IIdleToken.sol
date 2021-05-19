pragma solidity 0.7.6;

interface IIdleToken {
  function token() external returns (address underlying);
  function govTokens(uint256) external returns (address govToken);
  function userAvgPrices(address) external returns (uint256 avgPrice);
  function mintIdleToken(uint256 _amount, bool _skipWholeRebalance, address _referral) external returns (uint256 mintedTokens);
  function redeemIdleToken(uint256 _amount) external returns (uint256 redeemedTokens);
  function redeemInterestBearingTokens(uint256 _amount) external;
  function rebalance() external returns (bool);
  function rebalanceWithGST() external returns (bool);
  function tokenPrice() external view returns (uint256 price);
  function getAPRs() external view returns (address[] memory addresses, uint256[] memory aprs);
  function getAvgAPR() external view returns (uint256 avgApr);
  function getGovTokensAmounts(address _usr) external view returns (uint256[] memory _amounts);
  function openRebalance(uint256[] calldata _newAllocations) external returns (bool, uint256 avgApr);
}
