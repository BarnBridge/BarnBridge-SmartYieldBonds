// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../uniswap/UniswapMock.sol";

import "./../../providers/Mai3Controller.sol";

contract Mai3ControllerMock is Mai3Controller {
    address public _uniswapRouter;

    bool public mockProviderRatePerDay = false;
    uint256 public mockedProviderRatePerDay;
    uint256 public _timestamp;

    constructor(
        address pool_,
        address smartYield_,
        address bondModel_,
        address[] memory uniswapPath_,
        address mcbSpotOracle_,
        uint256 initialDailySupplyRate_
    ) Mai3Controller(pool_, smartYield_, bondModel_, uniswapPath_, mcbSpotOracle_, initialDailySupplyRate_) {
        _uniswapRouter = address(new UniswapMock());
        updateAllowances();
    }

    function uniswapRouter() public view override returns (address) {
        return _uniswapRouter == address(0x0) ? 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D : _uniswapRouter;
    }

    function uniswapPriceCumulativesNow() public pure override returns (uint256[] memory) {
        // shortcut uniswapPriceCumulativesNow
        uint256[] memory newUniswapPriceCumulatives = new uint256[](0);
        return newUniswapPriceCumulatives;
    }

    function providerRatePerDay() public virtual override returns (uint256) {
        if (mockProviderRatePerDay) {
            return mockedProviderRatePerDay;
        }
        return super.providerRatePerDay();
    }

    function setProviderRatePerDay(bool mockProviderRatePerDay_, uint256 mockedProviderRatePerDay_) public {
        mockProviderRatePerDay = mockProviderRatePerDay_;
        mockedProviderRatePerDay = mockedProviderRatePerDay_;
    }

    function getTimestamp() public view virtual override returns (uint256) {
        return _timestamp != 0 ? _timestamp : block.timestamp;
    }

    function setTimestamp(uint256 timestamp_) public {
        _timestamp = timestamp_;
    }
}
