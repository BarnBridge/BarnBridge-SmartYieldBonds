// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./external-interfaces/compound-finance/ICToken.sol";
import "./external-interfaces/compound-finance/IComptroller.sol";

import "./ASmartYieldPool.sol";
import "./model/IBondModel.sol";

interface WithDecimals {
    function decimals() external view returns (uint8);
}

// todo: initialize compound
contract SmartYieldPoolCompound is ASmartYieldPool {
    IComptroller public comptroller;

    // underlying token (ie. DAI)
    IERC20 public uToken;
    // claim token (ie. cDAI)
    address public cToken;
    // deposit reward token (ie. COMP)
    IERC20 public rewardCToken;
    // weth
    IERC20 public wethToken;

    IUniswapV2Router02 public uniswap;

    IBondModel public bondModel;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;

    constructor(string memory name, string memory symbol)
        ASmartYieldPool(name, symbol)
    {}

    function setup(
        address oracle_,
        address bondModel_,
        address bondToken_,
        address cToken_,
        uint8 underlyingDecimals_
    ) external {
        this.setOracle(oracle_);
        bondModel = IBondModel(bondModel_);
        bondToken = BondToken(bondToken_);
        cToken = cToken_;
        uToken = IERC20(ICToken(cToken_).underlying());
        underlyingDecimals = underlyingDecimals_;
    }

    function currentTime() external view virtual override returns (uint256) {
        return block.timestamp;
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal()
        external
        view
        virtual
        override
        returns (uint256)
    {
        // TODO: add fees

        // https://compound.finance/docs#protocol-math
        return
            ICTokenErc20(cToken).balanceOf(address(this)) * ICToken(cToken).exchangeRateStored(); // - feesUnderlying;
    }

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(uint256 _principalAmount, uint16 _forDays)
        public
        view
        override
        returns (uint256)
    {
        return bondModel.gain(address(this), _principalAmount, _forDays);
    }

    function harvest() external override {
        // TODO: reward caller
        comptroller.claimComp(address(this));
        uint256 rewardAmount = rewardCToken.balanceOf(address(this));
        if (rewardAmount > 0) {
            rewardCToken.approve(address(uniswap), rewardAmount);
            address[] memory path = new address[](3);
            path[0] = address(rewardCToken);
            path[1] = address(wethToken);
            path[2] = address(uToken);
            uniswap.swapExactTokensForTokens(
                rewardAmount,
                uint256(0),
                path,
                address(this),
                this.currentTime() + 1800
            );
        }
        uint256 underAmount = uToken.balanceOf(address(this));
        if (underAmount > 0) {
            _depositProvider(underAmount);
        }
    }

    function _takeUnderlying(address _from, uint256 _underlyingAmount)
        internal
        override
    {
        require(
            _underlyingAmount <= uToken.allowance(_from, address(this)),
            "SYCOMP: _takeUnderlying allowance"
        );
        require(
            uToken.transferFrom(_from, address(this), _underlyingAmount),
            "SYCOMP: _takeUnderlying transferFrom"
        );
    }

    function _sendUnderlying(address _to, uint256 _underlyingAmount)
        internal
        override
        returns (bool)
    {
        return uToken.transfer(_to, _underlyingAmount);
    }

    function _depositProvider(uint256 _underlyingAmount) internal override {
        uToken.approve(address(cToken), _underlyingAmount);
        uint256 success = ICToken(cToken).mint(_underlyingAmount);
        require(0 == success, "SYCOMP: _depositProvider mint");
    }

    function _withdrawProvider(uint256 _underlyingAmount) internal override {
        uint256 success = ICToken(cToken).redeemUnderlying(_underlyingAmount);
        require(0 == success, "SYCOMP: _withdrawProvider redeemUnderlying");
    }
}
