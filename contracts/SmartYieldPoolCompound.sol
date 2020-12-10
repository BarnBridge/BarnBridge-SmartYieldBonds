// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "./ASmartYieldPool.sol";
import "./compound-finance/CTokenInterfaces.sol";

contract SmartYieldPoolCompound is ASmartYieldPool {
    // underlying token (ie. DAI)
    IERC20 public uToken;
    // claim token (ie. cDAI)
    CErc20Interface public cToken;
    // deposit reward token (ie. COMP)
    IERC20 public rewardCToken;

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
                .div(1 ether);
    }

    function takeUnderlying(address _from, uint256 _underlyingAmount)
        internal
        override
        returns (bool)
    {
        require(
            _underlyingAmount <= uToken.allowance(_from, address(this)),
            "SYCOMP: getUnderlying allowance"
        );
        return uToken.transferFrom(_from, address(this), _underlyingAmount);
    }

    function sendUnderlying(address _to, uint256 _underlyingAmount)
        internal
        override
        returns (bool)
    {
        return uToken.transfer(
            _to,
            _underlyingAmount
        );
    }

    function depositProvider(uint256 _underlyingAmount) internal virtual {
        uToken.approve(address(cToken), _underlyingAmount);
        uint256 success = cToken.mint(_underlyingAmount);
        require(0 == success, "SYCOMP: depositProvider mint");
    }

    function withdrawProvider(uint256 _underlyingAmount) internal virtual {
        uint256 success = cToken.redeemUnderlying(_underlyingAmount);
        require(0 == success, "SYCOMP: withdrawProvider redeemUnderlying");
    }

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(uint256 _principalAmount, uint16 _forDays)
        public
        override
        view
        returns (uint256)
    {
        return
            Math.compound(
                _principalAmount,
                seniorModel.slippage(address(this), _principalAmount, _forDays),
                _forDays
            );
    }
}
