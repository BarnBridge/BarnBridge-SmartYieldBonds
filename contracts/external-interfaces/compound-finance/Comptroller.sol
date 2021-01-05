// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

abstract contract Comptroller {
    mapping(address => uint) public compSpeeds;

    function claimComp(address holder) public virtual;
}
