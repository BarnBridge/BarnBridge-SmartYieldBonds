// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "hardhat/console.sol";

// TODO:
// 2 step withdraw + tests
// comp value + spot price + rate = min(MAX, oracle, spot)
// dumped CToken to fees
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
import "./ASmartYieldPoolLib.sol";

import "./Governed.sol";
import "./IController.sol";
import "./oracle/IYieldOraclelizable.sol";
import "./ISmartYieldPool.sol";

import "./model/IBondModel.sol";
import "./oracle/IYieldOracle.sol";
import "./IBond.sol";
import "./IJuniorToken.sol";

abstract contract ASmartYieldPool is
    ISmartYieldPool,
    IYieldOraclelizable,
    Governed
{
    using SafeMath for uint256;

    // controller address
    address public controller;

    // senior BOND {NFT}
    address public seniorBond; // IBond

    // junior BOND (NFT)
    address public juniorBond; // IBond

    // junior TOKEN (fungible)
    address public juniorToken; // IJuniorToken

    Storage public st;

    // add to all methods changeing the underlying
    // per https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/UniswapV2Pair.sol#L73
    // modifier accountYield() {
    //     ASmartYieldPoolLib.__accountYieldFirst(this, st);
    //     ASmartYieldPoolLib.__updateOracle(this);
    //     __executeJuniorWithdrawals();
    //     _;
    //     ASmartYieldPoolLib.__accountYieldLast(this, st);
    // }

    function _beforeProviderOp() internal {
        ASmartYieldPoolLib.__accountYieldFirst(this, st);
        ASmartYieldPoolLib.__updateOracle(this);
        ASmartYieldPoolLib.__executeJuniorWithdrawals(this, st);
    }

    function _afterProviderOp() internal {
        ASmartYieldPoolLib.__accountYieldLast(this, st);
    }

    function cumulatives()
      external override
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingTotal, uint256 blockTs) {
        ASmartYieldPoolLib.__accountYieldFirst(this, st);
        ASmartYieldPoolLib.__accountYieldLast(this, st);
        return (st.cumulativeSecondlyYieldLast, st.cumulativeUnderlyingTotalLast, this.currentTime());
    }

    // returns cumulated yield per 1 underlying coin (ie 1 DAI, 1 ETH) times 1e18
    // per https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2OracleLibrary.sol#L16
    function currentCumulatives()
        external view override
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingTotal, uint256 blockTs)
    {
      return ASmartYieldPoolLib.currentCumulatives(this, st);
    }

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(uint256 _principalAmount, uint16 _forDays)
      public view override
      returns (uint256)
    {
        return IBondModel(IController(controller).bondModel()).gain(address(this), _principalAmount, _forDays);
    }

    // Purchase a senior bond with _principalAmount underlying for _forDays, buyer gets a bond with gain >= _minGain or revert. _deadline is timestamp before which tx is not rejected.
    function buyBond(
        uint256 _principalAmount,
        uint256 _minGain,
        uint256 _deadline,
        uint16 _forDays
    ) public override
      //accountYield
    {
        _beforeProviderOp();

        require(
          false == IController(controller).PAUSED_BUY_SENIOR_BOND(),
          "ASYP: buyBond paused"
        );

        require(
          this.currentTime() <= _deadline,
          "ASYP: buyBond deadline"
        );

        require(
            0 < _forDays && _forDays <= IController(controller).BOND_LIFE_MAX(),
            "ASYP: buyBond forDays"
        );

        uint256 gain = this.bondGain(_principalAmount, _forDays);

        require(
          gain >= _minGain,
          "ASYP: buyBond minGain"
        );

        require(
          gain > 0,
          "ASYP: buyBond gain 0"
        );

        require(
          gain < this.underlyingLoanable(),
          "ASYP: buyBond underlyingLoanable"
        );

        uint256 issuedAt = this.currentTime();

        // ---

        _takeUnderlying(msg.sender, _principalAmount);
        _depositProvider(_principalAmount);

        SeniorBond memory b =
            SeniorBond(
                _principalAmount,
                gain,
                issuedAt,
                uint256(1 days) * uint256(_forDays) + issuedAt,
                false
            );

        ASmartYieldPoolLib._mintBond(this, st, msg.sender, b);

        _afterProviderOp();
    }

    // Redeem a senior bond by it's id. Anyone can redeem but owner gets principal + gain
    function redeemBond(
      uint256 _bondId
    ) public override
      //accountYield
    {
        _beforeProviderOp();

        require(
            this.currentTime() >= st.seniorBonds[_bondId].maturesAt,
            "ASYP: redeemBond not matured"
        );

        // bondToken.ownerOf will revert for burned tokens
        address payTo = IBond(seniorBond).ownerOf(_bondId);
        uint256 payAmnt = st.seniorBonds[_bondId].gain + st.seniorBonds[_bondId].principal;
        uint256 fee = MathUtils.fractionOf(st.seniorBonds[_bondId].gain, IController(controller).FEE_REDEEM_SENIOR_BOND());
        payAmnt -= fee;

        // ---

        if (st.seniorBonds[_bondId].liquidated == false) {
            st.seniorBonds[_bondId].liquidated = true;
            ASmartYieldPoolLib._unaccountBond(this, st, st.seniorBonds[_bondId]);
        }

        // bondToken.burn will revert for already burned tokens
        IBond(seniorBond).burn(_bondId);
        delete st.seniorBonds[_bondId];

        _withdrawProvider(payAmnt);
        _sendUnderlying(payTo, payAmnt);

        st.underlyingFees += fee;

        _afterProviderOp();
    }

    // removes matured seniorBonds from being accounted in abond
    function unaccountBonds(uint256[] memory _bondIds) public override {
        ASmartYieldPoolLib._unaccountBondsInternal(this, st, _bondIds);
    }

    // buy at least _minTokens with _underlyingAmount, before _deadline passes
    function buyTokens(
      uint256 underlyingAmount_,
      uint256 minTokens_,
      uint256 deadline_
    )
      public override
      //accountYield
    {
        _beforeProviderOp();

        require(
          false == IController(controller).PAUSED_BUY_JUNIOR_TOKEN(),
          "ASYP: buyTokens paused"
        );

        require(
          this.currentTime() <= deadline_,
          "ASYP: buyTokens deadline"
        );

        uint256 fee = MathUtils.fractionOf(underlyingAmount_, IController(controller).FEE_BUY_JUNIOR_TOKEN());
        uint256 getsTokens = (underlyingAmount_ - fee) * 1e18 / this.price();

        require(
          getsTokens >= minTokens_,
          "ASYP: buyTokens minTokens"
        );

        // ---

        _takeUnderlying(msg.sender, underlyingAmount_);
        _depositProvider(underlyingAmount_);
        IJuniorToken(juniorToken).mint(msg.sender, getsTokens);

        st.underlyingFees += fee;

        _afterProviderOp();
    }

    // sell _tokens for at least _minUnderlying, before _deadline and forfeit potential future gains
    function sellTokens(
      uint256 tokenAmount_,
      uint256 minUnderlying_,
      uint256 deadline_
    )
      public override
      //accountYield
    {
        _beforeProviderOp();

        require(
          this.currentTime() <= deadline_,
          "ASYP: sellTokens deadline"
        );

        // share of these tokens in the debt
        uint256 debtShare = tokenAmount_ * 1e18 / IJuniorToken(juniorToken).totalSupply();
        // debt share is forfeit, and only diff is returned to user
        uint256 toPay = (tokenAmount_ * this.price() - this.abondDebt() * debtShare) / 1e18;

        require(
          toPay >= minUnderlying_,
          "ASYP: sellTokens minUnderlying"
        );

        // ---

        IJuniorToken(juniorToken).burn(msg.sender, tokenAmount_);
        _withdrawProvider(toPay);
        _sendUnderlying(msg.sender, toPay);

        _afterProviderOp();
    }

    function buyJuniorBond(
      uint256 tokenAmount_,
      uint256 maxMaturesAt_,
      uint256 deadline_
    )
      public override
    {
        uint256 maturesAt = 1 + st.abond.maturesAt / 1e18;

        require(
          this.currentTime() <= deadline_,
          "ASYP: buyJuniorBond deadline"
        );

        require(
          maturesAt <= maxMaturesAt_,
          "ASYP: buyJuniorBond maxMaturesAt"
        );

        JuniorBond memory jb = JuniorBond(
          tokenAmount_,
          maturesAt
        );

        // ---

        _takeTokens(msg.sender, tokenAmount_);
        _mintJuniorBond(msg.sender, jb);

        // if abond.maturesAt is past we can liquidate, but juniorBondsMaturingAt might have already been liquidated
        if (this.currentTime() >= maturesAt) {
            JuniorBondsAt memory jBondsAt = st.juniorBondsMaturingAt[jb.maturesAt];

            if (jBondsAt.price == 0) {
                ASmartYieldPoolLib._liquidateJuniorsAt(this, st, jb.maturesAt);
            } else {
                // juniorBondsMaturingAt was previously liquidated,
                IJuniorToken(juniorToken).burn(address(this), jb.tokens); // burns user's locked tokens reducing the jToken supply
                st.underlyingLiquidatedJuniors += jb.tokens * jBondsAt.price / 1e18;
                _unaccountJuniorBond(jb);
            }
            return redeemJuniorBond(st.juniorBondId);
        }
    }

    function _mintJuniorBond(address to_, JuniorBond memory jb_)
      internal
    {
        require(
          st.juniorBondId < uint256(-1),
          "ASYP: _mintJuniorBond"
        );

        st.juniorBondId++;
        st.juniorBonds[st.juniorBondId] = jb_;

        _accountJuniorBond(jb_);
        IBond(juniorBond).mint(to_, st.juniorBondId);
    }

    function _accountJuniorBond(JuniorBond memory jb_)
      internal
    {
        st.tokensInJuniorBonds += jb_.tokens;

        JuniorBondsAt storage jBondsAt = st.juniorBondsMaturingAt[jb_.maturesAt];
        uint256 tmp;

        if (jBondsAt.tokens == 0 && this.currentTime() < jb_.maturesAt) {
          st.juniorBondsMaturities.push(jb_.maturesAt);
          for (uint256 i = st.juniorBondsMaturities.length - 1; i >= MathUtils.max(1, st.juniorBondsMaturitiesPrev); i--) {
            if (st.juniorBondsMaturities[i] > st.juniorBondsMaturities[i - 1]) {
              break;
            }
            tmp = st.juniorBondsMaturities[i - 1];
            st.juniorBondsMaturities[i - 1] = st.juniorBondsMaturities[i];
            st.juniorBondsMaturities[i] = tmp;
          }
        }

        jBondsAt.tokens += jb_.tokens;
    }

    function _burnJuniorBond(uint256 bondId_) internal {
        //JuniorBond memory jb = juniorBonds[bondId_];

        //_unaccountJuniorBond(jb);
        // blows up if already burned
        IBond(juniorBond).burn(bondId_);
    }

    function _unaccountJuniorBond(JuniorBond memory jb_) internal {
        st.tokensInJuniorBonds -= jb_.tokens;
        JuniorBondsAt storage jBondsAt = st.juniorBondsMaturingAt[jb_.maturesAt];
        jBondsAt.tokens -= jb_.tokens;
    }

    function redeemJuniorBond(uint256 jBondId_)
        public override
        //accountYield
    {
        _beforeProviderOp();

        JuniorBond memory jb = st.juniorBonds[jBondId_];
        require(
            jb.maturesAt <= this.currentTime(),
            "ASYP: redeemJuniorBond maturesAt"
        );

        JuniorBondsAt memory jBondsAt = st.juniorBondsMaturingAt[jb.maturesAt];

        // blows up if already burned
        address payTo = IBond(juniorBond).ownerOf(jBondId_);
        uint256 payAmnt = jBondsAt.price * jb.tokens / 1e18;

        // ---

        _burnJuniorBond(jBondId_);
        _withdrawProvider(payAmnt);
        _sendUnderlying(payTo, payAmnt);
        st.underlyingLiquidatedJuniors -= payAmnt;

        _afterProviderOp();
    }

    // jToken price * 1e18
    function price()
      public view override
    returns (uint256) {
        uint256 ts = IJuniorToken(juniorToken).totalSupply();
        return (ts == 0) ? 1e18 : (this.underlyingJuniors() * 1e18) / ts;
    }

    function underlyingJuniors()
      public view override
    returns (uint256) {
        return
            this.underlyingTotal() - st.abond.principal - this.abondPaid();
    }

    function underlyingLoanable()
      public view virtual override
    returns (uint256) {
        // underlyingTotal - abond.principal - abond.gain - queued withdrawls
        return this.underlyingTotal() - st.abond.principal - st.abond.gain - (st.tokensInJuniorBonds * this.price() / 1e18);
    }

    // function _mintBond(address _to, SeniorBond memory _bond) private {
    //     ASmartYieldPoolLib._mintBond(st, _to, _bond);

    //     // require(
    //     //   st.seniorBondId < uint256(-1),
    //     //   "ASYP: _mintBond"
    //     // );
    //     // st.seniorBondId++;
    //     // st.seniorBonds[st.seniorBondId] = _bond;
    //     // _accountBond(_bond);
    //     // IBond(seniorBond).mint(_to, st.seniorBondId);
    // }

    // // when a new bond is added to the pool, we want:
    // // - to average abond.maturesAt (the earliest date at which juniors can fully exit), this shortens the junior exit date compared to the date of the last active bond
    // // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    // function _accountBond(SeniorBond memory b) private {
    //     ASmartYieldPoolLib._accountBond(st, b);

    //     // uint256 currentTime = this.currentTime() * 1e18;

    //     // uint256 newDebt = this.abondDebt() + b.gain;
    //     // // for the very first bond or the first bond after abond maturity: this.abondDebt() = 0 => newMaturesAt = b.maturesAt
    //     // uint256 newMaturesAt = (st.abond.maturesAt * this.abondDebt() + b.maturesAt * 1e18 * b.gain) / newDebt;

    //     // // timestamp = timestamp - tokens * d / tokens
    //     // uint256 newIssuedAt = newMaturesAt.sub(uint256(1) + ((st.abond.gain + b.gain) * (newMaturesAt - currentTime)) / newDebt, "ASYP: liquidate some seniorBonds");

    //     // st.abond = SeniorBond(
    //     //   st.abond.principal + b.principal,
    //     //   st.abond.gain + b.gain,
    //     //   newIssuedAt,
    //     //   newMaturesAt,
    //     //   false
    //     // );

    // }

    // // when a bond is redeemed from the pool, we want:
    // // - for abond.maturesAt (the earliest date at which juniors can fully exit) to remain the same as before the redeem
    // // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    // function _unaccountBond(SeniorBond memory b) private {
    //     uint256 currentTime = this.currentTime() * 1e18;

    //     if ((currentTime >= st.abond.maturesAt)) {
    //       // abond matured
    //       // this.abondDebt() == 0
    //       st.abond = SeniorBond(
    //         st.abond.principal - b.principal,
    //         st.abond.gain - b.gain,
    //         currentTime - (st.abond.maturesAt - st.abond.issuedAt),
    //         currentTime,
    //         false
    //       );

    //       return;
    //     }

    //     // timestamp = timestamp - tokens * d / tokens
    //     uint256 newIssuedAt = st.abond.maturesAt.sub(uint256(1) + (st.abond.gain - b.gain) * (st.abond.maturesAt - currentTime) / this.abondDebt(), "ASYP: liquidate some seniorBonds");

    //     st.abond = SeniorBond(
    //       st.abond.principal - b.principal,
    //       st.abond.gain - b.gain,
    //       newIssuedAt,
    //       st.abond.maturesAt,
    //       false
    //     );

    // }

    function abondGain() public view override returns (uint256) {
        return st.abond.gain;
    }

    function abondPaid() public view override returns (uint256) {
        uint256 ts = this.currentTime() * 1e18;
        if (ts <= st.abond.issuedAt || (st.abond.maturesAt <= st.abond.issuedAt)) {
          return 0;
        }

        uint256 d = st.abond.maturesAt - st.abond.issuedAt;
        return (this.abondGain() * MathUtils.min(ts - st.abond.issuedAt, d)) / d;
    }

    function abondDebt() public view override returns (uint256) {
        return this.abondGain() - this.abondPaid();
    }

    function _takeTokens(address _from, uint256 _amount) internal {
        require(
            _amount <= IJuniorToken(juniorToken).allowance(_from, address(this)),
            "ASYP: _takeTokens allowance"
        );
        require(
            IJuniorToken(juniorToken).transferFrom(_from, address(this), _amount),
            "ASYP: _takeTokens transferFrom"
        );
    }

    function _takeUnderlying(address _from, uint256 _amount) internal virtual;

    function _sendUnderlying(address _to, uint256 _amount)
        internal
        virtual
        returns (bool);

    function _depositProvider(uint256 _underlyingAmount) internal virtual;

    function _withdrawProvider(uint256 _underlyingAmount) internal virtual;
}
