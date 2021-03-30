pragma solidity ^0.7.6;

interface IMai3Oracle {
    function isTerminated() external returns (bool);

    function priceTWAPShort()
        external
        returns (int256 newPrice, uint256 newTimestamp);
}
