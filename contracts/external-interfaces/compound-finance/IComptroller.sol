// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

abstract contract IComptroller {
    struct CompMarketState {
      uint224 index;
      uint32 block;
    }

    function getCompAddress()
      public view virtual
    returns(address);

    function compSupplyState(address market)
      public view virtual
    returns (uint224 index, uint32 blk);

    function claimComp(
      address[] memory holders,
      address[] memory cTokens,
      bool borrowers,
      bool suppliers
    )
    public virtual;

    function enterMarkets(address[] memory cTokens)
      public virtual
    returns (uint256[] memory);

    function compSupplierIndex(address, address)
      public view virtual
    returns (uint256);

    function compSpeeds(address)
      public view virtual
    returns (uint256);
}
