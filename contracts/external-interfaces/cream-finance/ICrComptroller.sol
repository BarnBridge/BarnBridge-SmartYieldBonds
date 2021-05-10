// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

interface ICrComptroller {
    struct CompMarketState {
        uint224 index;
        uint32 block;
    }

    function enterMarkets(address[] memory cTokens) external returns (uint256[] memory);
    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers) external;
    function mintAllowed(address cToken, address minter, uint256 mintAmount) external returns (uint256);

    function getCompAddress() external view returns(address);
    function compSupplyState(address cToken) external view returns (uint224, uint32);
    function compSpeeds(address cToken) external view returns (uint256);
    function oracle() external view returns (address);
}
