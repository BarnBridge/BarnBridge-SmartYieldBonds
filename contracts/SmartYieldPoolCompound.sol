// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "./ASmartYieldPool.sol";
import "./external-interfaces/compound-finance/ICToken.sol";
import "./external-interfaces/compound-finance/IComptroller.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface WithDecimals {
  function decimals() external view returns (uint8);
}

// todo: initialize compound
contract SmartYieldPoolCompound is ASmartYieldPool {
    IComptroller public comptroller;

    // underlying token (ie. DAI)
    IERC20 public uToken;
    // claim token (ie. cDAI)
    ICToken public cToken;
    // deposit reward token (ie. COMP)
    IERC20 public rewardCToken;
    // weth
    IERC20 public wethToken;

    IUniswapV2Router02 public uniswap;

    uint256 public constant BLOCKS_PER_YEAR = 2102400;
    uint256 public constant BLOCKS_PER_DAY = BLOCKS_PER_YEAR / 365;

    constructor(string memory name, string memory symbol)
        ASmartYieldPool(name, symbol)
    {}

    function setup(
      address cToken_
    ) external {
      cToken = ICToken(cToken_);
    }

    function currentTime() external virtual override view returns (uint256) {
      return block.timestamp;
    }

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external virtual override view returns (uint256) {
        // https://compound.finance/docs#protocol-math
        uint256 cTokenDecimals = 8;
        return
            ICTokenErc20(address(cToken)).balanceOf(address(this)) / (10 ^ (18 - cTokenDecimals)) * cToken.exchangeRateStored() / (10 ^ this.underlyingDecimals());
    }

    function underlyingDecimals() external virtual override view returns (uint256) {
        return uint256(WithDecimals(address(uToken)).decimals());
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

    function providerRatePerDay() external override view returns (uint256) {
        // to do: oracle
        return 0;
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
          uniswap.swapExactTokensForTokens(rewardAmount, uint256(0), path, address(this), block.timestamp + 1800);
        }
        uint256 underAmount = uToken.balanceOf(address(this));
        if (underAmount > 0) {
          _depositProvider(underAmount);
        }
    }

    function _takeUnderlying(address _from, uint256 _underlyingAmount)
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

    function _sendUnderlying(address _to, uint256 _underlyingAmount)
        internal
        override
        returns (bool)
    {
        return uToken.transfer(_to, _underlyingAmount);
    }

    function _depositProvider(uint256 _underlyingAmount)
        internal
        override
    {
        uToken.approve(address(cToken), _underlyingAmount);
        uint256 success = cToken.mint(_underlyingAmount);
        require(0 == success, "SYCOMP: depositProvider mint");
    }

    function _withdrawProvider(uint256 _underlyingAmount)
        internal
        override
    {
        uint256 success = cToken.redeemUnderlying(_underlyingAmount);
        require(0 == success, "SYCOMP: withdrawProvider redeemUnderlying");
    }
}
