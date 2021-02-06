// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "../../external-interfaces/compound-finance/IComptroller.sol";

contract ComptrollerMock is IComptroller {

    address public holder;
    address public cToken;

    bool public claimCompCalled = false;
    bool public enterMarketsCalled = false;

    function compSupplyState(address market) public view override returns (uint224 index, uint32 blk) {
      require(market == cToken, "ComptrollerMock: compSupplyState market");
      return (0, 0);
    }

    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers) public override {
      require(holders.length == 1, "ComptrollerMock: claimComp one holders");
      require(cTokens.length == 1, "ComptrollerMock: claimComp one cTokens");
      require(holder == holders[0], "ComptrollerMock: claimComp holder");
      require(cToken == cTokens[0], "ComptrollerMock: claimComp cToken");
      require(suppliers, "ComptrollerMock: claimComp suppliers");
      require(!borrowers, "ComptrollerMock: claimComp borrowers");
      claimCompCalled = true;
    }

    function enterMarkets(address[] memory cTokens) public override returns (uint[] memory) {
      require(cTokens.length == 1, "ComptrollerMock: enterMarkets one cTokens");
      require(cToken == cTokens[0], "ComptrollerMock: enterMarkets cToken");
      enterMarketsCalled = true;
      uint256[] memory r = new uint256[](1);
      r[0] = uint256(0);
      return r;
    }

    function setHolder(address holder_) public {
      holder = holder_;
    }

    function setMarket(address market_) public {
      cToken = market_;
    }

    function getCompAddress() public view override returns(address){
      return address(0);
    }
}
