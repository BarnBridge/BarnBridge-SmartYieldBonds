// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;

import "hardhat/console.sol";

// TODO:
// 2 step withdraw + tests
// comp value + spot price + rate = min(MAX, oracle, spot)
// dumped CToken to fees
// dao, settings
// pause guardian trading
// settings in Controller
// tests

// feature: pause deposits

// configurable:
// DAO is owner
// owner can be changed
// configurable by DAO BOND_LIFE_MAX, at launch =3mo
// guardian address can pause
// guardian can be changed by owner
// MAX_YIELD allowed for sBONDS can be changed by guardian / dao
// https://github.com/BarnBridge/BarnBridge-SmartYieldBonds/blob/master/SPEC.md#senior-deposit-buy-bond, x = (cur_j - (b_p*x*n*b_t)) / (cur_tot + b_p + (b_p*x*n*b_t)) * n * m,  <- bond yield formula should be pluggable
// oracle should be pluggable

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./lib/math/MathUtils.sol";

import "./Governed.sol";
import "./IController.sol";
import "./oracle/IYieldOraclelizable.sol";
import "./ISmartYieldPool.sol";

import "./model/IBondModel.sol";
import "./oracle/IYieldOracle.sol";
import "./IBond.sol";
import "./IJuniorToken.sol";
import "./ASmartYieldPool.sol";

library ASmartYieldPoolLib
{
    using SafeMath for uint256;

    // returns cumulated yield per 1 underlying coin (ie 1 DAI, 1 ETH) times 1e18
    // per https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2OracleLibrary.sol#L16
    function currentCumulatives(ISmartYieldPool.Storage storage st)
        internal view
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingTotal, uint256 blockTs)
    {
        ASmartYieldPool pool = ASmartYieldPool(address(this));

        uint32 blockTimestamp = uint32(pool.currentTime() % 2**32);
        cumulativeSecondlyYield = st.cumulativeSecondlyYieldLast;
        cumulativeUnderlyingTotal = st.cumulativeUnderlyingTotalLast;

        uint32 timeElapsed = blockTimestamp - st.timestampLast; // overflow is desired
        if (timeElapsed > 0 && st.underlyingTotalLast > 0) {
            // cumulativeSecondlyYield overflows eventually,
            // due to the way it is used in the oracle that's ok,
            // as long as it doesn't overflow twice during the windowSize
            // see OraclelizedMock.cumulativeOverflowProof() for proof
            cumulativeSecondlyYield +=
                // (this.underlyingTotal() - underlyingTotalLast) * 1e18 -> overflows only if (this.underlyingTotal() - underlyingTotalLast) >~ 10^41 ETH, DAI, USDC etc
                // (this.underlyingTotal() - underlyingTotalLast) never underflows
                ((pool.underlyingTotal() - st.underlyingTotalLast) * 1e18) /
                st.underlyingTotalLast;

            cumulativeUnderlyingTotal += pool.underlyingTotal() * timeElapsed;
        }
        return (cumulativeSecondlyYield, cumulativeUnderlyingTotal, uint256(blockTimestamp));
    }

    function _mintBond(ISmartYieldPool.Storage storage st, address _to, ISmartYieldPool.SeniorBond memory _bond)
      internal
    {
        ASmartYieldPool pool = ASmartYieldPool(address(this));

        require(
          st.seniorBondId < uint256(-1),
          "ASYP: _mintBond"
        );

        st.seniorBondId++;
        st.seniorBonds[st.seniorBondId] = _bond;
        _accountBond(st, _bond);
        IBond(pool.seniorBond()).mint(_to, st.seniorBondId);
    }

    // when a new bond is added to the pool, we want:
    // - to average abond.maturesAt (the earliest date at which juniors can fully exit), this shortens the junior exit date compared to the date of the last active bond
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _accountBond(ISmartYieldPool.Storage storage st, ISmartYieldPool.SeniorBond memory b)
      internal
    {
        ASmartYieldPool pool = ASmartYieldPool(address(this));

        uint256 currentTime = pool.currentTime() * 1e18;

        uint256 newDebt = pool.abondDebt() + b.gain;
        // for the very first bond or the first bond after abond maturity: this.abondDebt() = 0 => newMaturesAt = b.maturesAt
        uint256 newMaturesAt = (st.abond.maturesAt * pool.abondDebt() + b.maturesAt * 1e18 * b.gain) / newDebt;

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = newMaturesAt.sub(uint256(1) + ((st.abond.gain + b.gain) * (newMaturesAt - currentTime)) / newDebt, "ASYP: liquidate some seniorBonds");

        st.abond = ISmartYieldPool.SeniorBond(
          st.abond.principal + b.principal,
          st.abond.gain + b.gain,
          newIssuedAt,
          newMaturesAt,
          false
        );
    }

    // when a bond is redeemed from the pool, we want:
    // - for abond.maturesAt (the earliest date at which juniors can fully exit) to remain the same as before the redeem
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _unaccountBond(ISmartYieldPool.Storage storage st, ISmartYieldPool.SeniorBond memory b)
      internal
    {
        ASmartYieldPool pool = ASmartYieldPool(address(this));

        uint256 currentTime = pool.currentTime() * 1e18;

        if ((currentTime >= st.abond.maturesAt)) {
          // abond matured
          // this.abondDebt() == 0
          st.abond = ISmartYieldPool.SeniorBond(
            st.abond.principal - b.principal,
            st.abond.gain - b.gain,
            currentTime - (st.abond.maturesAt - st.abond.issuedAt),
            currentTime,
            false
          );

          return;
        }

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = st.abond.maturesAt.sub(uint256(1) + (st.abond.gain - b.gain) * (st.abond.maturesAt - currentTime) / pool.abondDebt(), "ASYP: liquidate some seniorBonds");

        st.abond = ISmartYieldPool.SeniorBond(
          st.abond.principal - b.principal,
          st.abond.gain - b.gain,
          newIssuedAt,
          st.abond.maturesAt,
          false
        );

    }

}
