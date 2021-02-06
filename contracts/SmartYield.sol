// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "hardhat/console.sol";

// TODO:
// comp value + spot price + rate = min(MAX, oracle, spot)
// tests

// configurable:
// MAX_YIELD allowed for sBONDS can be changed by guardian / dao

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./lib/math/MathUtils.sol";

import "./Governed.sol";
import "./IController.sol";
import "./oracle/IYieldOraclelizable.sol";
import "./ISmartYield.sol";

import "./IProviderPool.sol";

import "./model/IBondModel.sol";
import "./oracle/IYieldOracle.sol";
import "./IBond.sol";
import "./JuniorToken.sol";

contract SmartYield is
    JuniorToken,
    ISmartYield,
    Governed
{
    using SafeMath for uint256;

    // controller address
    address public controller;

    // address of IProviderPool
    address public pool;

    // senior BOND {NFT}
    address public seniorBond; // IBond

    // junior BOND (NFT)
    address public juniorBond; // IBond

    // underlying amount in matured and liquidated juniorBonds
    uint256 public underlyingLiquidatedJuniors;

    // tokens amount in unmatured juniorBonds or matured and unliquidated
    uint256 public tokensInJuniorBonds;

    // latest SeniorBond Id
    uint256 public seniorBondId;

    // latest JuniorBond Id
    uint256 public juniorBondId;

    // last index of juniorBondsMaturities that was liquidated
    uint256 public juniorBondsMaturitiesPrev;
    // list of junior bond maturities (timestamps)
    uint256[] public juniorBondsMaturities;

    // pool state / average bond
    // holds rate of payment by juniors to seniors
    SeniorBond public abond;

    // checkpoints for all JuniorBonds matureing at (timestamp) -> (JuniorBondsAt)
    // timestamp -> JuniorBondsAt
    mapping(uint256 => JuniorBondsAt) public juniorBondsMaturingAt;

    // metadata for senior bonds
    // bond id => bond (SeniorBond)
    mapping(uint256 => SeniorBond) public seniorBonds;

    // metadata for junior bonds
    // bond id => bond (JuniorBond)
    mapping(uint256 => JuniorBond) public juniorBonds;

    constructor(
      string memory name,
      string memory symbol
    )
      JuniorToken(name, symbol)
    {}

    function currentTime()
      external view virtual override
      returns (uint256)
    {
        // mockable
        return block.timestamp;
    }

    function providerRatePerDay() external view virtual override returns (uint256) {
        return IYieldOracle(IController(controller).oracle()).consult(1 days);
    }

    function _beforeProviderOp() internal {
      // this modifier will be added to the begginging of all (write) functions.
      // The first tx after a queued liquidation's timestamp will trigger the liquidation
      // reducing the jToken supply, and setting aside owed_dai for withdrawals
      for (uint256 i = juniorBondsMaturitiesPrev; i < juniorBondsMaturities.length; i++) {
          if (this.currentTime() >= juniorBondsMaturities[i]) {
              _liquidateJuniorsAt(juniorBondsMaturities[i]);
              juniorBondsMaturitiesPrev = i + 1;
          } else {
              break;
          }
      }
    }

    function _liquidateJuniorsAt(uint256 timestamp)
      internal
    {
        JuniorBondsAt storage jBondsAt = juniorBondsMaturingAt[timestamp];

        require(
          jBondsAt.tokens > 0,
          "ASYP: nothing to liquidate"
        );

        require(
          jBondsAt.price == 0,
          "ASYP: already liquidated"
        );

        jBondsAt.price = this.price();

        // ---

        underlyingLiquidatedJuniors += jBondsAt.tokens * jBondsAt.price / 1e18;
        _burn(address(this), jBondsAt.tokens); // burns Junior locked tokens reducing the jToken supply
        tokensInJuniorBonds -= jBondsAt.tokens;
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

        IProviderPool(pool)._takeUnderlying(msg.sender, _principalAmount);
        IProviderPool(pool)._depositProvider(_principalAmount, 0);

        SeniorBond memory b =
            SeniorBond(
                _principalAmount,
                gain,
                issuedAt,
                uint256(1 days) * uint256(_forDays) + issuedAt,
                false
            );

        _mintBond(msg.sender, b);
    }

    // Redeem a senior bond by it's id. Anyone can redeem but owner gets principal + gain
    function redeemBond(
      uint256 _bondId
    ) public override
    {
        _beforeProviderOp();

        require(
            this.currentTime() >= seniorBonds[_bondId].maturesAt,
            "ASYP: redeemBond not matured"
        );

        // bondToken.ownerOf will revert for burned tokens
        address payTo = IBond(seniorBond).ownerOf(_bondId);
        uint256 payAmnt = seniorBonds[_bondId].gain + seniorBonds[_bondId].principal;
        uint256 fee = MathUtils.fractionOf(seniorBonds[_bondId].gain, IController(controller).FEE_REDEEM_SENIOR_BOND());
        payAmnt -= fee;

        // ---

        if (seniorBonds[_bondId].liquidated == false) {
            seniorBonds[_bondId].liquidated = true;
            _unaccountBond(seniorBonds[_bondId]);
        }

        // bondToken.burn will revert for already burned tokens
        IBond(seniorBond).burn(_bondId);
        delete seniorBonds[_bondId];

        IProviderPool(pool)._withdrawProvider(payAmnt, fee);
        IProviderPool(pool)._sendUnderlying(payTo, payAmnt);
    }

    // removes matured seniorBonds from being accounted in abond
    function unaccountBonds(uint256[] memory bondIds_) public override {
      for (uint256 f = 0; f < bondIds_.length; f++) {
        if (
            this.currentTime() > seniorBonds[bondIds_[f]].maturesAt &&
            seniorBonds[bondIds_[f]].liquidated == false
        ) {
            seniorBonds[bondIds_[f]].liquidated = true;
            _unaccountBond(seniorBonds[bondIds_[f]]);
        }
      }
    }

    // buy at least _minTokens with _underlyingAmount, before _deadline passes
    function buyTokens(
      uint256 underlyingAmount_,
      uint256 minTokens_,
      uint256 deadline_
    )
      public override
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

        IProviderPool(pool)._takeUnderlying(msg.sender, underlyingAmount_);
        IProviderPool(pool)._depositProvider(underlyingAmount_, fee);
        _mint(msg.sender, getsTokens);
    }

    // sell _tokens for at least _minUnderlying, before _deadline and forfeit potential future gains
    function sellTokens(
      uint256 tokenAmount_,
      uint256 minUnderlying_,
      uint256 deadline_
    )
      public override
    {
        _beforeProviderOp();

        require(
          this.currentTime() <= deadline_,
          "ASYP: sellTokens deadline"
        );

        // share of these tokens in the debt
        uint256 debtShare = tokenAmount_ * 1e18 / totalSupply();
        // debt share is forfeit, and only diff is returned to user
        uint256 toPay = (tokenAmount_ * this.price() - this.abondDebt() * debtShare) / 1e18;

        require(
          toPay >= minUnderlying_,
          "ASYP: sellTokens minUnderlying"
        );

        // ---

        _burn(msg.sender, tokenAmount_);
        IProviderPool(pool)._withdrawProvider(toPay, 0);
        IProviderPool(pool)._sendUnderlying(msg.sender, toPay);
    }

    function buyJuniorBond(
      uint256 tokenAmount_,
      uint256 maxMaturesAt_,
      uint256 deadline_
    )
      public override
    {
        uint256 maturesAt = 1 + abond.maturesAt / 1e18;

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
            JuniorBondsAt memory jBondsAt = juniorBondsMaturingAt[jb.maturesAt];

            if (jBondsAt.price == 0) {
                _liquidateJuniorsAt(jb.maturesAt);
            } else {
                // juniorBondsMaturingAt was previously liquidated,
                _burn(address(this), jb.tokens); // burns user's locked tokens reducing the jToken supply
                underlyingLiquidatedJuniors += jb.tokens * jBondsAt.price / 1e18;
                _unaccountJuniorBond(jb);
            }
            return redeemJuniorBond(juniorBondId);
        }
    }



    // -------------------

    function _mintBond(address _to, SeniorBond memory _bond)
      internal
    {
        require(
          seniorBondId < uint256(-1),
          "ASYP: _mintBond"
        );

        seniorBondId++;
        seniorBonds[seniorBondId] = _bond;
        _accountBond(_bond);
        IBond(seniorBond).mint(_to, seniorBondId);
    }

    // when a new bond is added to the pool, we want:
    // - to average abond.maturesAt (the earliest date at which juniors can fully exit), this shortens the junior exit date compared to the date of the last active bond
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _accountBond(SeniorBond memory b)
      internal
    {
        uint256 _now = this.currentTime() * 1e18;

        uint256 newDebt = this.abondDebt() + b.gain;
        // for the very first bond or the first bond after abond maturity: this.abondDebt() = 0 => newMaturesAt = b.maturesAt
        uint256 newMaturesAt = (abond.maturesAt * this.abondDebt() + b.maturesAt * 1e18 * b.gain) / newDebt;

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = newMaturesAt.sub(uint256(1) + ((abond.gain + b.gain) * (newMaturesAt - _now)) / newDebt, "ASYP: liquidate some seniorBonds");

        abond = SeniorBond(
          abond.principal + b.principal,
          abond.gain + b.gain,
          newIssuedAt,
          newMaturesAt,
          false
        );
    }

    // when a bond is redeemed from the pool, we want:
    // - for abond.maturesAt (the earliest date at which juniors can fully exit) to remain the same as before the redeem
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _unaccountBond(SeniorBond memory b)
      internal
    {
        uint256 now_ = this.currentTime() * 1e18;

        if ((now_ >= abond.maturesAt)) {
          // abond matured
          // this.abondDebt() == 0
          abond = SeniorBond(
            abond.principal - b.principal,
            abond.gain - b.gain,
            now_ - (abond.maturesAt - abond.issuedAt),
            now_,
            false
          );

          return;
        }

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = abond.maturesAt.sub(uint256(1) + (abond.gain - b.gain) * (abond.maturesAt - now_) / this.abondDebt(), "ASYP: liquidate some seniorBonds");

        abond = SeniorBond(
          abond.principal - b.principal,
          abond.gain - b.gain,
          newIssuedAt,
          abond.maturesAt,
          false
        );
    }

    function _mintJuniorBond(address to_, JuniorBond memory jb_)
      internal
    {
        require(
          juniorBondId < uint256(-1),
          "ASYP: _mintJuniorBond"
        );

        juniorBondId++;
        juniorBonds[juniorBondId] = jb_;

        _accountJuniorBond(jb_);
        IBond(juniorBond).mint(to_, juniorBondId);
    }

    function _accountJuniorBond(JuniorBond memory jb_)
      internal
    {
        tokensInJuniorBonds += jb_.tokens;

        JuniorBondsAt storage jBondsAt = juniorBondsMaturingAt[jb_.maturesAt];
        uint256 tmp;

        if (jBondsAt.tokens == 0 && this.currentTime() < jb_.maturesAt) {
          juniorBondsMaturities.push(jb_.maturesAt);
          for (uint256 i = juniorBondsMaturities.length - 1; i >= MathUtils.max(1, juniorBondsMaturitiesPrev); i--) {
            if (juniorBondsMaturities[i] > juniorBondsMaturities[i - 1]) {
              break;
            }
            tmp = juniorBondsMaturities[i - 1];
            juniorBondsMaturities[i - 1] = juniorBondsMaturities[i];
            juniorBondsMaturities[i] = tmp;
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
        tokensInJuniorBonds -= jb_.tokens;
        JuniorBondsAt storage jBondsAt = juniorBondsMaturingAt[jb_.maturesAt];
        jBondsAt.tokens -= jb_.tokens;
    }

    function redeemJuniorBond(uint256 jBondId_)
        public override
        //accountYield
    {
        _beforeProviderOp();

        JuniorBond memory jb = juniorBonds[jBondId_];
        require(
            jb.maturesAt <= this.currentTime(),
            "ASYP: redeemJuniorBond maturesAt"
        );

        JuniorBondsAt memory jBondsAt = juniorBondsMaturingAt[jb.maturesAt];

        // blows up if already burned
        address payTo = IBond(juniorBond).ownerOf(jBondId_);
        uint256 payAmnt = jBondsAt.price * jb.tokens / 1e18;

        // ---

        _burnJuniorBond(jBondId_);
        IProviderPool(pool)._withdrawProvider(payAmnt, 0);
        IProviderPool(pool)._sendUnderlying(payTo, payAmnt);
        underlyingLiquidatedJuniors -= payAmnt;
    }

    // jToken price * 1e18
    function price()
      public view override
    returns (uint256) {
        uint256 ts = totalSupply();
        return (ts == 0) ? 1e18 : (this.underlyingJuniors() * 1e18) / ts;
    }

    function underlyingTotal()
      public view virtual override
      returns(uint256)
    {
      return IProviderPool(pool).underlyingBalance() - IProviderPool(pool).underlyingFees() - underlyingLiquidatedJuniors;
    }

    function underlyingJuniors()
      public view virtual override
    returns (uint256) {
        return
            this.underlyingTotal() - abond.principal - this.abondPaid();
    }

    function underlyingLoanable()
      public view virtual override
    returns (uint256) {
        // underlyingTotal - abond.principal - abond.gain - queued withdrawls
        return this.underlyingTotal() - abond.principal - abond.gain - (tokensInJuniorBonds * this.price() / 1e18);
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
        return abond.gain;
    }

    function abondPaid() public view override returns (uint256) {
        uint256 ts = this.currentTime() * 1e18;
        if (ts <= abond.issuedAt || (abond.maturesAt <= abond.issuedAt)) {
          return 0;
        }

        uint256 d = abond.maturesAt - abond.issuedAt;
        return (this.abondGain() * MathUtils.min(ts - abond.issuedAt, d)) / d;
    }

    function abondDebt() public view override returns (uint256) {
        return this.abondGain() - this.abondPaid();
    }

    function _takeTokens(address _from, uint256 _amount) internal {
        require(
            _amount <= allowance(_from, address(this)),
            "ASYP: _takeTokens allowance"
        );
        require(
            transferFrom(_from, address(this), _amount),
            "ASYP: _takeTokens transferFrom"
        );
    }

}
