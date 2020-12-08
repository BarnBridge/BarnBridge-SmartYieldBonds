// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "./ASmartYieldPool.sol";

contract SmartYieldPoolCompound is ASmartYieldPool {

    // underlying token (ie. DAI)
    IERC20 public uToken;
    // claim token (ie. cDAI)
    CErc20Interface public cToken;
    // deposit reward token (ie. COMP)
    IERC20 public rewardCToken;

    // bond id => bond (Bond)
    mapping(uint256 => Bond) public bonds;

    constructor(string memory name, string memory symbol)
        public
        ASmartYieldPool(name, symbol)
    {}

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external override view returns (uint256) {
        return
            cToken
                .balanceOf(address(this))
                .mul(cToken.exchangeRateStored())
                .div(10**18);
    }

    function takeUnderlying(address from, uint256 underlyingAmount)
        internal
        override
        returns (bool)
    {
        require(
            underlyingAmount <= uToken.allowance(from, address(this)),
            "SYCOMP: getUnderlying allowance"
        );
        return uToken.transferFrom(from, address(this), underlyingAmount);
    }

    function sendUnderlying(address to, uint256 amount)
        internal
        override
        returns (uint256)
    {}

    function depositProvider(uint256 underlyingAmount)
        internal
        virtual
        returns (uint256)
    {
        uToken.approve(address(cToken), underlyingAmount);
        uint256 cTokens = cToken.mint(underlyingAmount);
        require(0 == cTokens, "SYCOMP: depositProvider mint");
        return cTokens;
    }

    function withdrawProvider(uint256 underlyingAmount)
        internal
        virtual
        returns (uint256)
      {}

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(
        uint256 _principalAmount,
        uint16 _forDays
    ) public view override returns (uint256) {
        return Math.compound(
          _principalAmount,
          seniorModel.slippage(address(this), _principalAmount, _forDays),
          _forDays
        );
    }

}
