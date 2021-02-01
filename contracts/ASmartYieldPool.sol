// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

import "hardhat/console.sol";

// TODO:
// 2 step withdraw
// comp value
// fees
// dao, settings
// pause guardian trading
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

import "./model/IBondModel.sol";
import "./oracle/IYieldOracle.sol";
import "./oracle/IYieldOraclelizable.sol";
import "./ISmartYieldPool.sol";
import "./ISeniorBond.sol";
import "./IJuniorToken.sol";

abstract contract ASmartYieldPool is
    ISmartYieldPool,
    IYieldOraclelizable
    //ERC20
{
    using SafeMath for uint256;

    IYieldOracle public oracle;

    // --- fees

    // fee for buying jTokens
    uint256 public FEE_TOKEN_BUY = 3 * 1e16; // 3%

    // fee for redeeming a sBond
    uint256 public FEE_BOND_REDEEM = 3 * 1e16;

    // fees colected in underlying
    uint256 public underlyingFees;

    // --- /fees

    uint16 public BOND_LIFE_MAX = 90; // in days

    uint256 public underlyingWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniorsAtRisk;

    uint256 public seniorBondId;

    mapping(uint256 => Withdrawal) public queuedWithdrawals; // timestamp -> Withdrawal
    uint256[] public queuedWithdrawalTimestamps;
    uint256 public lastQueuedWithdrawalTimestampsI; // defaults to 0
    uint256 public tokensInWithdrawls;
    uint256 public tokensInWithdrawlsAtRisk;

    mapping(address => JuniorWithdrawal) public queuedJuniors;

    uint256 public underlyingTotalLast;

    // CUMULATIVE
    // cumulates (new yield per second) * (seconds since last cumulation)
    uint256 public cumulativeSecondlyYieldLast;
    // cummulates balanceOf underlying
    uint256 public cumulativeUnderlyingTotalLast;
    // timestamp of the last cumulation
    uint32 public timestampLast;
    // /CUMULATIVE

    // bond id => bond (Bond)
    mapping(uint256 => Bond) public bonds;

    // pool state / average bond
    // holds rate of payment by juniors to seniors
    Bond public abond;

    uint256 public bondsOutstanding;

    // senior BOND NFT
    ISeniorBond public seniorBond;

    IJuniorToken public juniorToken;

    IBondModel public bondModel;

    // is currentCumulativeSecondlyYield() providing correct values?
    bool public _safeToObserve = false;

    modifier executeJuniorWithdrawals {
        // this modifier will be added to all (write) functions.
        // The first tx after a queued liquidation's timestamp will trigger the liquidation
        // reducing the jToken supply, and setting aside owed_dai for withdrawals
        for (
            uint256 i = lastQueuedWithdrawalTimestampsI;
            i < queuedWithdrawalTimestamps.length;
            i++
        ) {
            if (this.currentTime() >= queuedWithdrawalTimestamps[i]) {
                _liquidateJuniors(queuedWithdrawalTimestamps[i]);
                lastQueuedWithdrawalTimestampsI = i;
            } else {
                break;
            }
        }
        _;
    }

    // add to all methods changeing the underlying
    // per https://github.com/Uniswap/uniswap-v2-core/blob/master/contracts/UniswapV2Pair.sol#L73
    modifier accountYield() {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        uint32 timeElapsed = blockTimestamp - timestampLast; // overflow is desired
        // only for the first time in the block && if there's underlying
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            // cumulativeSecondlyYieldLast overflows eventually,
            // due to the way it is used in the oracle that's ok,
            // as long as it doesn't overflow twice during the windowSize
            // see OraclelizedMock.cumulativeOverflowProof() for proof
            cumulativeSecondlyYieldLast +=
                // (this.underlyingTotal() - underlyingTotalLast) * 1e18 -> overflows only if (this.underlyingTotal() - underlyingTotalLast) >~ 10^41 ETH, DAI, USDC etc
                // (this.underlyingTotal() - underlyingTotalLast) never underflows
                ((this.underlyingTotal() - underlyingTotalLast) * 1e18) /
                underlyingTotalLast;

            cumulativeUnderlyingTotalLast += this.underlyingTotal() * timeElapsed;

            _safeToObserve = true;
            timestampLast = blockTimestamp;
        }
        _;
        underlyingTotalLast = this.underlyingTotal();
    }

    constructor() {}

    function setBondMaxLife(uint16 bondMaxLife_) external {
        BOND_LIFE_MAX = bondMaxLife_;
    }

    // returns cumulated yield per 1 underlying coin (ie 1 DAI, 1 ETH) times 1e18
    // per https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2OracleLibrary.sol#L16
    function currentCumulatives()
        external view override
    returns (uint256 cumulativeSecondlyYield, uint256 cumulativeUnderlyingTotal, uint256 blockTs)
    {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        cumulativeSecondlyYield = cumulativeSecondlyYieldLast;
        cumulativeUnderlyingTotal = cumulativeUnderlyingTotalLast;

        uint32 timeElapsed = blockTimestamp - timestampLast; // overflow is desired
        if (timeElapsed > 0 && underlyingTotalLast > 0) {
            // cumulativeSecondlyYield overflows eventually,
            // due to the way it is used in the oracle that's ok,
            // as long as it doesn't overflow twice during the windowSize
            // see OraclelizedMock.cumulativeOverflowProof() for proof
            cumulativeSecondlyYield +=
                // (this.underlyingTotal() - underlyingTotalLast) * 1e18 -> overflows only if (this.underlyingTotal() - underlyingTotalLast) >~ 10^41 ETH, DAI, USDC etc
                // (this.underlyingTotal() - underlyingTotalLast) never underflows
                ((this.underlyingTotal() - underlyingTotalLast) * 1e18) /
                underlyingTotalLast;

            cumulativeUnderlyingTotal += this.underlyingTotal() * timeElapsed;
        }
        return (cumulativeSecondlyYield, cumulativeUnderlyingTotal, uint256(blockTimestamp));
    }

    // given a principal amount and a number of days, compute the guaranteed bond gain, excluding principal
    function bondGain(uint256 _principalAmount, uint16 _forDays)
      public view override
      returns (uint256)
    {
        return bondModel.gain(address(this), _principalAmount, _forDays);
    }

    function safeToObserve() external view override returns (bool) {
        return _safeToObserve;
    }

    // Purchase a senior bond with _principalAmount underlying for _forDays, buyer gets a bond with gain >= _minGain or revert. _deadline is timestamp before which tx is not rejected.
    function buyBond(
        uint256 _principalAmount,
        uint256 _minGain,
        uint256 _deadline,
        uint16 _forDays
    ) external override
      accountYield executeJuniorWithdrawals
    {
        require(
          this.currentTime() <= _deadline,
          "ASYP: buyBond deadline"
        );

        require(
            0 < _forDays && _forDays <= BOND_LIFE_MAX,
            "ASYP: buyBond forDays"
        );

        uint256 gain = this.bondGain(_principalAmount, _forDays);

        require(gain >= _minGain, "ASYP: buyBond minGain");
        require(
            gain < this.underlyingJuniors(),
            "ASYP: buyBond underlyingJuniors"
        );

        uint256 issuedAt = this.currentTime();

        Bond memory b =
            Bond(
                _principalAmount,
                gain,
                issuedAt,
                uint256(1 days) * uint256(_forDays) + issuedAt,
                false
            );

        _takeUnderlying(msg.sender, _principalAmount);
        _depositProvider(_principalAmount);
        _mintBond(msg.sender, b);
    }

    // Redeem a senior bond by it's id. Anyone can redeem but owner gets principal + gain
    function redeemBond(
      uint256 _bondId
    ) external override
      accountYield executeJuniorWithdrawals
    {
        require(
            this.currentTime() > bonds[_bondId].maturesAt,
            "ASYP: redeemBond not matured"
        );

        // bondToken.ownerOf will revert for burned tokens
        address payTo = seniorBond.ownerOf(_bondId);
        uint256 payAmnt = bonds[_bondId].gain + bonds[_bondId].principal;
        uint256 fee = MathUtils.fractionOf(bonds[_bondId].gain, FEE_BOND_REDEEM);
        payAmnt -= fee;

        // ---

        if (bonds[_bondId].liquidated == false) {
            bonds[_bondId].liquidated = true;
            _unaccountBond(bonds[_bondId]);
        }

        // bondToken.burn will revert for already burned tokens
        seniorBond.burn(_bondId);

        _withdrawProvider(payAmnt);
        _sendUnderlying(payTo, payAmnt);

        underlyingFees += fee;
    }

    // removes matured bonds from being accounted in abond
    function unaccountBonds(uint256[] memory _bondIds) external override {
        for (uint256 f = 0; f < _bondIds.length; f++) {
            if (
                this.currentTime() > bonds[_bondIds[f]].maturesAt &&
                bonds[_bondIds[f]].liquidated == false
            ) {
                bonds[_bondIds[f]].liquidated = true;
                _unaccountBond(bonds[_bondIds[f]]);
            }
        }
    }

    // buy at least _minTokens with _underlyingAmount, before _deadline passes
    function buyTokens(
      uint256 _underlyingAmount,
      uint256 _minTokens,
      uint256 _deadline
    )
      external override
      accountYield executeJuniorWithdrawals
    {
        require(
          this.currentTime() <= _deadline,
          "ASYP: buyTokens deadline"
        );

        uint256 fee = MathUtils.fractionOf(_underlyingAmount, FEE_TOKEN_BUY);
        uint256 getsTokens = (_underlyingAmount - fee) * 1e18 / this.price();

        require(
          getsTokens >= _minTokens,
          "ASYP: buyTokens minTokens"
        );

        _takeUnderlying(msg.sender, _underlyingAmount);
        _depositProvider(_underlyingAmount);
        juniorToken.mint(msg.sender, getsTokens);

        underlyingFees += fee;
    }

    // sell _tokens for at least _minUnderlying, before _deadline and forfeit potential future gains
    function sellTokens(
      uint256 _tokens,
      uint256 _minUnderlying,
      uint256 _deadline
    )
      external override
      accountYield executeJuniorWithdrawals
    {
        require(
          this.currentTime() <= _deadline,
          "ASYP: sellTokens deadline"
        );

        uint256 unlockedRatio = (this.abondGain() == 0) ? 1e18 : (this.abondPaid() * 1e18) / this.abondGain();
        uint256 toPay = ((_tokens * unlockedRatio / 1e18) * this.price()) / 1e18;

        require(
          toPay >= _minUnderlying,
          "ASYP: buyTokens minTokens"
        );

        juniorToken.burn(msg.sender, _tokens);
        _withdrawJuniors(msg.sender, toPay);
    }

    function withdrawTokensInitiate(
      uint256 _tokens
    )
      external override
      accountYield executeJuniorWithdrawals
    {
        //uint256 memory userJtokens = balanceOf(msg.sender);

        // basically the portion of jToken that represents the ABOND.reward x elapsed_ABOND_duration_multiplier (1 meaning full duration left, 0.5 meaning half duration left)
        uint256 jTokensAtRisk = (_tokens * 1e18 * this.abondDebt()) / (juniorToken.totalSupply() * this.price());

        // queue user's jTokens for liquidation
        Withdrawal storage withdrawal = queuedWithdrawals[abond.maturesAt];
        if (withdrawal.tokens == 0) {
            queuedWithdrawalTimestamps.push(abond.maturesAt);
        }
        withdrawal.tokens += _tokens;
        withdrawal.tokensAtRisk += jTokensAtRisk;

        // lock user jTokens (transfer to self), and register liquidation object for user
        _takeTokens(msg.sender, _tokens);
        tokensInWithdrawls += _tokens;
        tokensInWithdrawlsAtRisk += jTokensAtRisk;

        // TODO: ????????

        // id = hash(sender + maturesAt) = 5
        // 5
        JuniorWithdrawal storage juniorWithdrawal = queuedJuniors[msg.sender];
        juniorWithdrawal.tokens = _tokens;
        juniorWithdrawal.tokensAtRisk = jTokensAtRisk;
        juniorWithdrawal.timestamp = abond.maturesAt;
        // with UserLiquidation set, this user address can not buy jTokens until the 2nd step is complete. (for gas efficiency purposes)

        if (this.currentTime() >= abond.maturesAt) {
            // SPECIAL CASE
            // In case ABOND.end is in the past, liquidate immediately
            if (withdrawal.price == 0) {
                _liquidateJuniors(abond.maturesAt);
            } else {
                underlyingWithdrawlsJuniors += juniorWithdrawal.tokens * withdrawal.price;
                juniorToken.burn(address(this), juniorWithdrawal.tokens); // burns user's locked tokens reducing the jToken supply
                tokenWithdrawlsJuniors -= juniorWithdrawal.tokens;
                tokenWithdrawlsJuniorsAtRisk -= juniorWithdrawal.tokensAtRisk;
            }
            //return this.withdrawTokensFinalize();
        }

        //return juniorWithdrawal;
    }

    function withdrawTokensFinalize()
        external override
        accountYield executeJuniorWithdrawals
    {
        JuniorWithdrawal storage juniorWithdrawal = queuedJuniors[msg.sender];
        require(juniorWithdrawal.tokens > 0, "No liquidation queued for user");
        require(
            juniorWithdrawal.timestamp <= this.currentTime(),
            "ASYP: withdrawTokensFinalize still locked"
        );

        Withdrawal storage withdrawal =
            queuedWithdrawals[juniorWithdrawal.timestamp];

        uint256 underlyingToPay = withdrawal.price * juniorWithdrawal.tokens;

        // remove lock
        juniorWithdrawal.tokens = 0;
        juniorWithdrawal.tokensAtRisk = 0;
        juniorWithdrawal.timestamp = 0;

        // sell cDAI (or provider's DAI to pay the user)
        _withdrawJuniors(msg.sender, underlyingToPay);

        underlyingWithdrawlsJuniors -= underlyingToPay;

        //return owed_dai_to_user;
    }

    function _liquidateJuniors(uint256 timestamp) internal {
        Withdrawal storage withdrawal = queuedWithdrawals[timestamp];
        require(withdrawal.tokens > 0, "no queued liquidation");
        require(withdrawal.price == 0, "already liquidated");

        //recalculate current price (takes into account P&L)
        //recalculateJTokenPrice();
        withdrawal.price = this.price();

        underlyingWithdrawlsJuniors += withdrawal.tokens * withdrawal.price;
        juniorToken.burn(address(this), withdrawal.tokens); // burns Junior locked tokens reducing the jToken supply
        tokenWithdrawlsJuniors -= withdrawal.tokens;
        tokenWithdrawlsJuniorsAtRisk -= withdrawal.tokensAtRisk;
    }

    // jToken price * 1e18
    function price()
      external view override
    returns (uint256) {
        uint256 ts = juniorToken.totalSupply();
        return (ts == 0) ? 1 : (this.underlyingJuniors() * 1e18) / ts;
    }

    function underlyingJuniors()
      external view override
    returns (uint256) {
        // underlyingTotal - abond.principal - debt paid - queued withdrawls
        return
            this.underlyingTotal() -
            abond.principal -
            this.abondPaid() -
            underlyingWithdrawlsJuniors;
    }

    function underlyingLoanable()
      external view virtual override
    returns (uint256) {
        return this.underlyingTotal() - abond.principal - abond.gain - underlyingWithdrawlsJuniors;
    }

    function _withdrawJuniors(address _to, uint256 _underlyingAmount) internal {
        _withdrawProvider(_underlyingAmount);
        _sendUnderlying(_to, _underlyingAmount);
    }

    function _mintBond(address _to, Bond memory _bond) private {
        require(seniorBondId < uint256(-1), "ASYP: @ end of the univers");
        seniorBondId++;
        bonds[seniorBondId] = _bond;
        _accountBond(_bond);
        seniorBond.mint(_to, seniorBondId);
    }

    // when a new bond is added to the pool, we want:
    // - to average abond.maturesAt (the earliest date at which juniors can fully exit), this shortens the junior exit date compared to the date of the last active bond
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _accountBond(Bond memory b) private {
        uint256 currentTime = this.currentTime() * 1e18;

        uint256 newDebt = this.abondDebt() + b.gain;
        // for the very first bond or the first bond after abond maturity: this.abondDebt() = 0 => newMaturesAt = b.maturesAt
        uint256 newMaturesAt = (abond.maturesAt * this.abondDebt() + b.maturesAt * 1e18 * b.gain) / newDebt;

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = newMaturesAt.sub(uint256(1) + ((abond.gain + b.gain) * (newMaturesAt - currentTime)) / newDebt, "ASYP: liquidate some bonds");

        abond = Bond(
          abond.principal + b.principal,
          abond.gain + b.gain,
          newIssuedAt,
          newMaturesAt,
          false
        );

        bondsOutstanding++;
    }

    // when a bond is redeemed from the pool, we want:
    // - for abond.maturesAt (the earliest date at which juniors can fully exit) to remain the same as before the redeem
    // - to keep the price for jTokens before a bond is bought ~equal with the price for jTokens after a bond is bought
    function _unaccountBond(Bond memory b) private {
        uint256 currentTime = this.currentTime() * 1e18;

        if ((currentTime >= abond.maturesAt)) {
          // abond matured
          // this.abondDebt() == 0
          abond = Bond(
            abond.principal - b.principal,
            abond.gain - b.gain,
            currentTime - (abond.maturesAt - abond.issuedAt),
            currentTime,
            false
          );

          bondsOutstanding--;
          return;
        }

        // timestamp = timestamp - tokens * d / tokens
        uint256 newIssuedAt = abond.maturesAt.sub(uint256(1) + (abond.gain - b.gain) * (abond.maturesAt - currentTime) / this.abondDebt(), "ASYP: liquidate some bonds");

        abond = Bond(
          abond.principal - b.principal,
          abond.gain - b.gain,
          newIssuedAt,
          abond.maturesAt,
          false
        );

        bondsOutstanding--;
    }

    function abondGain() external view override returns (uint256) {
        return abond.gain;
    }

    function _abondPaidAt(uint256 timestamp_) internal view returns (uint256) {
      timestamp_ = timestamp_ * 1e18;
      if (timestamp_ <= abond.issuedAt || (abond.maturesAt <= abond.issuedAt)) {
        return 0;
      }

      uint256 d = abond.maturesAt - abond.issuedAt;

      return (this.abondGain() * MathUtils.min(timestamp_ - abond.issuedAt, d)) / d;
    }

    function abondPaid() external view override returns (uint256) {
        return _abondPaidAt(this.currentTime());
    }

    function abondDebt() external view override returns (uint256) {
        return this.abondGain() - this.abondPaid();
    }

    function _takeTokens(address _from, uint256 _amount) internal {
        require(
            _amount <= juniorToken.allowance(_from, address(this)),
            "ASYP: _takeTokens allowance"
        );
        require(
            juniorToken.transferFrom(_from, address(this), _amount),
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
