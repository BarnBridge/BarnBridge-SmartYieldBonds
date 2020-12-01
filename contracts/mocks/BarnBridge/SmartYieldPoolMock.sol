// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

// @TODO:
import "hardhat/console.sol";

import "../../lib/math/Math.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../../compound-finance/CTokenInterfaces.sol";
import "../../Model/Bond/IBondSlippageModel.sol";
import "../../Model/Token/ITokenPriceModel.sol";

import "../../SeniorBondToken.sol";
import "../../JuniorPoolToken.sol";

import "../../SmartYieldPool.sol";

contract SmartYieldPoolMock is SmartYieldPool {
    constructor(address _cToken)
        public
        SmartYieldPool(_cToken, address(0), address(0), address(0))
    {}

    function setStateUnderlyingBondsPrincipal(uint256 _underlyingBondsPrincipal)
        public
    {
        poolState.underlyingBondsPrincipal = _underlyingBondsPrincipal;
    }

    function setStateUnderlyingBondsTotal(uint256 _underlyingBondsTotal)
        public
    {
        poolState.underlyingBondsTotal = _underlyingBondsTotal;
    }

    function setStateUnderlyingJuniors(uint256 _underlyingJuniors) public {
        poolState.underlyingJuniors = _underlyingJuniors;
    }

    function setStateUnderlyingPoolFees(uint256 _underlyingPoolFees) public {
        poolState.underlyingPoolFees = _underlyingPoolFees;
    }

    function setCToken(address _cToken) public {
        cToken = CErc20Interface(_cToken);
    }

    function setUnderlying(address _underlying) public {
        underlying = IERC20(_underlying);
    }

    function setRewardCToken(address _rewardCToken) public {
        rewardCToken = IERC20(_rewardCToken);
    }

    function setJuniorModel(address _juniorModel) public {
        juniorModel = ITokenPriceModel(_juniorModel);
    }

    function setSeniorModel(address _seniorModel) public {
        seniorModel = IBondSlippageModel(_seniorModel);
    }

    function setSeniorToken(address _seniorBondToken) public {
        seniorBondToken = SeniorBondToken(_seniorBondToken);
    }

    function setJuniorToken(address _juniorToken) public {
        juniorToken = JuniorPoolToken(_juniorToken);
    }
}
