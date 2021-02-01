// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

abstract contract IComptroller {
    struct CompMarketState {
        uint224 index;
        uint32 block;
    }

    //uint224 public compInitialIndex;

    //mapping(address => uint) public compSpeeds;

    function compSupplyState(address market)
        public view virtual
        returns (uint224 index, uint32 blk);

    //mapping(address => mapping(address => uint)) public compSupplierIndex;

    //mapping(address => uint) public compAccrued;

    //function claimComp(address holder) public virtual;

    function claimComp(
        address[] memory holders,
        address[] memory cTokens,
        bool borrowers,
        bool suppliers
    ) public virtual;

    function enterMarkets(address[] memory cTokens)
        public virtual
        returns (uint256[] memory);
}
