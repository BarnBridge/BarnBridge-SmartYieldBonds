// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "./../Erc20Mock.sol";

import "../../external-interfaces/compound-finance/IComptroller.sol";

contract ComptrollerMock is IComptroller {

    address public holder;
    address public cToken;
    address public compAddress;
    uint256 public claimCompOut;
    uint224 public compSupplyStateIndex;

    uint256 public claimCompCalled;
    uint256 public enterMarketsCalled;

    function reset(
      address holder_,
      address cToken_,
      address compAddress_,
      uint256 claimCompOut_,
      uint224 compSupplyStateIndex_
    ) external {
      holder = holder_;
      cToken = cToken_;
      compAddress = compAddress_;
      claimCompOut = claimCompOut_;
      compSupplyStateIndex = compSupplyStateIndex_;

      claimCompCalled = 0;
      enterMarketsCalled = 0;
    }

    function setCToken(address cToken_) public {
      cToken = cToken_;
    }

    function setHolder(address holder_) public {
      holder = holder_;
    }

    function setMarket(address market_) public {
      cToken = market_;
    }

    function claimComp(address[] memory holders, address[] memory cTokens, bool borrowers, bool suppliers) public override {
      require(holders.length == 1, "ComptrollerMock: claimComp one holders");
      require(cTokens.length == 1, "ComptrollerMock: claimComp one cTokens");
      require(holder == holders[0], "ComptrollerMock: claimComp holder");
      require(cToken == cTokens[0], "ComptrollerMock: claimComp cToken");
      require(suppliers, "ComptrollerMock: claimComp suppliers");
      require(!borrowers, "ComptrollerMock: claimComp borrowers");

      Erc20Mock(compAddress).mintMock(holder, claimCompOut);

      claimCompCalled++;
    }

    function enterMarkets(address[] memory cTokens) public override returns (uint[] memory) {
      require(cTokens.length == 1, "ComptrollerMock: enterMarkets one cTokens");
      require(cToken == cTokens[0], "ComptrollerMock: enterMarkets cToken");

      enterMarketsCalled++;

      uint256[] memory r = new uint256[](1);
      r[0] = uint256(0);
      return r;
    }

    function compSupplyState(address market) public view override returns (uint224 index, uint32 blk) {
      require(market == cToken, "ComptrollerMock: compSupplyState market");

      return (compSupplyStateIndex, 0);
    }

    function getCompAddress() public view override returns(address){
      return compAddress;
    }

    function compSupplierIndex(address, address)
      public view override
    returns (uint256) {
      return 0;
    }

    function compSpeeds(address)
      public view override
    returns (uint256) {
      return 0;
    }
}
