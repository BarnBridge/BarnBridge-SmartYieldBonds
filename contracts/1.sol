// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SmartYield {
    IERC20 public underlying;
    IERC20 public jtoken; // jtoken.totalSupply = jtoken.totalSupply + jpoolToken

    uint256 public spoolPayments;
    uint256 public spoolYield;

    uint256 public jpoolCollateral;
    uint256 public jpoolToken;

    uint256 public tpoolToken;
    uint256 public tpoolUnderlying;

    uint256 public underlyingPrev;
    uint256 public blockPrev;

    uint256 public lastMaturesAt;

    struct Swap {
        uint256 collateral;
        uint256 jpoolCollateral;
        uint256 jpoolJtoken;
        uint256 exitBonus;
        bool isBear;
    }

    struct SeniorBond {
        uint256 principal;
        uint256 sYield;
        uint256 maturesAt;
        uint256 exitBonus;
    }

    function bookLossProfitStart() internal {
      uint256 debt = debtPaymentTranche(spoolYield - spoolPayments, lastMaturesAt, blockPrev, block.timestamp);
      uint256 yield = underlying.balanceOf(address(this)) - underlyingPrev;
      uint256 excessYield = max(0, yield - debt);

      jtoken.mint(excessYield);

      distributeDebt(debt);
      distributeExcessYield(excessYield);
    }

    function bookLossProfitEnd() internal {
      blockPrev = block.timestamp;
      underlyingPrev = underlying.balanceOf(address(this));
    }

    function distributeDebt(uint256 debt) internal {
      jpoolCollateral -= debt;
      spoolPayments += debt;
      // todo: distributes debt jpool up / down
    }

    function distributeExcessYield(uint256 excessYield) internal {
      // distributes excessYield between tpool and jpool (jpool up / down)
    }

    function debtPaymentTranche(uint256 jpoolDebt, uint256 lastMaturesAt, uint256 paidAtPrev, uint256 paidAtNow)
        public
        pure
        returns (uint256)
    {
        // function computes the amount of debt to be paid to bonds since paidAtPrev until paidAtNow
    }

    function liquidate(Swap swap) external {
      require(swap.jpoolCollateral >= jpoolCollateral, "SWAP is liquid");
      // tokens should be sold to jtoken OR
      // to liquidator at best price between the two
      uint256 gotUnderlying = jtoken.sell(tokensInSwap(swap));
      // swap is bad, underlyingInSwap(swap) is negative
      underlying.transfer(msg.sender, gotUnderlying + underlyingInSwap(swap));
      burn(swap);
    }

    function buySwap(uint256 collateral, bool imBear) external returns (Swap) {
        bookLossProfitStart();
        underlying.transferFrom(msg.sender, address(this), collateral);
        jpoolCollateral += collateral;
        Swap s = Swap(
                collateral,
                jpoolCollateral,
                jpoolToken,
                0,
                imBear
            );

        bookLossProfitEnd();
        return s;
    }
}

//seniorBond[bondId] = SeniorBond(principal, gain, startingAt, maturesAt);
