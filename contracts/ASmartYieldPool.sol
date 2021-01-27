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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "./oracle/YieldOracle.sol";
import "./oracle/IYieldOracle.sol";
import "./oracle/IYieldOraclelizable.sol";
import "./lib/math/Math.sol";
import "./ISmartYieldPool.sol";
import "./BondToken.sol";

abstract contract ASmartYieldPool is
    ISmartYieldPool,
    IYieldOraclelizable,
    ERC20
{
    using SafeMath for uint256;

    IYieldOracle public oracle;

    struct Withdrawal {
        uint256 tokens; // in jTokens
        uint256 tokensAtRisk; // in jTokens
        uint256 price; // bbcDAI_to_DAI_ratio - 0 means not triggered
    }

    struct JuniorWithdrawal {
        uint256 tokens; // in jTokens
        uint256 tokensAtRisk; // in jTokens
        uint256 timestamp;
    }

    uint256 public constant DAYS_IN_YEAR = 365;

    uint16 public BOND_LIFE_MAX = 90; // in days

    uint256 public underlyingDepositsJuniors;
    uint256 public underlyingWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniorsAtRisk;

    uint256 public bondIdCurrent;

    mapping(uint256 => Withdrawal) public queuedWithdrawals; // timestamp -> Withdrawal
    uint256[] public queuedWithdrawalTimestamps;
    uint256 public lastQueuedWithdrawalTimestampsI; // defaults to 0
    uint256 public tokensInWithdrawls;
    uint256 public tokensInWithdrawlsAtRisk;

    mapping(address => JuniorWithdrawal) public queuedJuniors;

    uint256 public underlyingTotalLast;

    // cumulates (new yield per second) * (seconds since last cumulation)
    uint256 public cumulativeSecondlyYieldLast;
    // timestamp of the last cumulation
    uint32 public timestampLast;

    // bond id => bond (Bond)
    mapping(uint256 => Bond) public bonds;

    // pool state / average bond
    // holds rate of payment by juniors to seniors
    Bond public abond;

    uint256 public bondsOutstanding;

    // senior BOND NFT
    BondToken public bondToken;

    uint8 public override underlyingDecimals;

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

            _safeToObserve = true;
            timestampLast = blockTimestamp;
        }
        _;
        underlyingTotalLast = this.underlyingTotal();
    }

    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
    {}

    function setOracle(address _oracle) external {
        oracle = IYieldOracle(_oracle);
    }

    function setBondMaxLife(uint16 bondMaxLife_) external {
        BOND_LIFE_MAX = bondMaxLife_;
    }

    // returns cumulated yield per 1 underlying coin (ie 1 DAI, 1 ETH) times 1e18
    // per https://github.com/Uniswap/uniswap-v2-periphery/blob/master/contracts/libraries/UniswapV2OracleLibrary.sol#L16
    function currentCumulativeSecondlyYield()
        external
        view
        override
        returns (uint256 cumulativeYield, uint256 blockTs)
    {
        uint32 blockTimestamp = uint32(this.currentTime() % 2**32);
        uint256 cumulativeSecondlyYield = cumulativeSecondlyYieldLast;
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
        }
        return (cumulativeSecondlyYield, blockTimestamp);
    }

    function safeToObserve() external view override returns (bool) {
        return _safeToObserve;
    }

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forDays
     * @dev
     */
    function buyBond(
        uint256 _principalAmount,
        uint256 _minGain,
        uint16 _forDays
    ) external override accountYield executeJuniorWithdrawals {
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

    function redeemBond(uint256 _bondId)
        external
        override
        accountYield
        executeJuniorWithdrawals
    {
        require(
            this.currentTime() > bonds[_bondId].maturesAt,
            "ASYP: redeemBond not matured"
        );

        uint256 toPay = bonds[_bondId].gain + bonds[_bondId].principal;

        if (bonds[_bondId].liquidated == false) {
            bonds[_bondId].liquidated = true;
            _unaccountBond(bonds[_bondId]);
        }

        _withdrawProvider(toPay);
        // bondToken.ownerOf will revert for burned tokens
        _sendUnderlying(bondToken.ownerOf(_bondId), toPay);
        // bondToken.burn will revert for already burned tokens
        bondToken.burn(_bondId);
    }

    function liquidateBonds(uint256[] memory _bondIds) external override {
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

    function buyTokens(uint256 _underlyingAmount)
        external
        override
        accountYield
        executeJuniorWithdrawals
    {
        _takeUnderlying(msg.sender, _underlyingAmount);
        _depositProvider(_underlyingAmount);
        _mint(msg.sender, _underlyingAmount / this.price());
        underlyingDepositsJuniors += _underlyingAmount;
    }

    function sellTokens(uint256 _jTokens) external override {
        _burn(msg.sender, _jTokens);
        uint256 unlocked =
            (this.abondGain() == 0)
                ? (1 ether)
                : ((this.abondPaid() * (1 ether)) / this.abondGain());
        uint256 toPay =
            (((_jTokens * unlocked) / (1 ether)) * this.price()) / (1 ether);
        _withdrawJuniors(msg.sender, toPay);
    }

    function withdrawTokensInitiate(uint256 _jTokens)
        external
        override
        accountYield
        executeJuniorWithdrawals
    {
        //uint256 memory userJtokens = balanceOf(msg.sender);

        // basically the portion of jToken that represents the ABOND.reward x elapsed_ABOND_duration_multiplier (1 meaning full duration left, 0.5 meaning half duration left)
        uint256 jTokensAtRisk =
            (_jTokens *
                (abond.gain / this.price() / totalSupply()) *
                (abond.maturesAt -
                    Math.min(this.currentTime(), abond.maturesAt))) /
                (abond.maturesAt - abond.issuedAt);

        // queue user's jTokens for liquidation
        Withdrawal storage withdrawal = queuedWithdrawals[abond.maturesAt];
        if (withdrawal.tokens == 0) {
            queuedWithdrawalTimestamps.push(abond.maturesAt);
        }
        withdrawal.tokens += _jTokens;
        withdrawal.tokensAtRisk += jTokensAtRisk;

        // lock user jTokens (transfer to self), and register liquidation object for user
        _takeTokens(msg.sender, _jTokens);
        tokensInWithdrawls += _jTokens;
        tokensInWithdrawlsAtRisk += jTokensAtRisk;
        JuniorWithdrawal storage juniorWithdrawal = queuedJuniors[msg.sender];
        juniorWithdrawal.tokens = _jTokens;
        juniorWithdrawal.tokensAtRisk = jTokensAtRisk;
        juniorWithdrawal.timestamp = abond.maturesAt;
        // with UserLiquidation set, this user address can not buy jTokens until the 2nd step is complete. (for gas efficiency purposes)

        if (this.currentTime() >= abond.maturesAt) {
            // SPECIAL CASE
            // In case ABOND.end is in the past, liquidate immediately
            if (withdrawal.price == 0) {
                _liquidateJuniors(abond.maturesAt);
            } else {
                underlyingWithdrawlsJuniors +=
                    juniorWithdrawal.tokens *
                    withdrawal.price;
                _burn(address(this), juniorWithdrawal.tokens); // burns user's locked tokens reducing the jToken supply
                tokenWithdrawlsJuniors -= juniorWithdrawal.tokens;
                tokenWithdrawlsJuniorsAtRisk -= juniorWithdrawal.tokensAtRisk;
            }
            //return this.withdrawTokensFinalize();
        }

        //return juniorWithdrawal;
    }

    function withdrawTokensFinalize()
        external
        override
        accountYield
        executeJuniorWithdrawals
    {
        JuniorWithdrawal storage juniorWithdrawal = queuedJuniors[msg.sender];
        require(juniorWithdrawal.tokens > 0, "No liquidation queued for user");
        require(
            juniorWithdrawal.timestamp <= this.currentTime(),
            "Lock period is not over"
        );

        Withdrawal storage withdrawal =
            queuedWithdrawals[juniorWithdrawal.timestamp];

        uint256 owed_dai_to_user = withdrawal.price * withdrawal.tokens;

        // remove lock
        juniorWithdrawal.tokens = 0;
        juniorWithdrawal.tokensAtRisk = 0;
        juniorWithdrawal.timestamp = 0;

        // sell cDAI (or provider's DAI to pay the user)
        _withdrawJuniors(msg.sender, owed_dai_to_user);

        underlyingWithdrawlsJuniors -= owed_dai_to_user;

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
        _burn(address(this), withdrawal.tokens); // burns Junior locked tokens reducing the jToken supply
        tokenWithdrawlsJuniors -= withdrawal.tokens;
        tokenWithdrawlsJuniorsAtRisk -= withdrawal.tokensAtRisk;
    }

    function price() external view override returns (uint256) {
        uint256 ts = totalSupply();
        return (ts == 0) ? 1 : (this.underlyingJuniors() * (1 ether)) / ts;
    }

    function underlyingJuniors() external view override returns (uint256) {
        // TODO: fees
        // underlyingTotal - abond.principal - debt paid - queued withdrawls
        return
            this.underlyingTotal() -
            abond.principal -
            this.abondPaid() -
            underlyingWithdrawlsJuniors;
    }

    function underlyingLoanable() external view override returns (uint256) {
        return this.underlyingTotal() - abond.principal - abond.gain;
    }

    function _withdrawJuniors(address _to, uint256 _underlyingAmount) internal {
        underlyingDepositsJuniors -=
            (_underlyingAmount * underlyingDepositsJuniors) /
            this.underlyingJuniors();
        _withdrawProvider(_underlyingAmount);
        _sendUnderlying(_to, _underlyingAmount);
    }

    function _mintBond(address _to, Bond memory _bond) private {
        require(bondIdCurrent < uint256(-1), "ASYP: @ end of the univers");
        bondIdCurrent++;
        bonds[bondIdCurrent] = _bond;
        _accountBond(_bond);
        bondToken.mint(_to, bondIdCurrent);
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

      return (this.abondGain() * Math.min(timestamp_ - abond.issuedAt, d)) / d;
    }

    function abondPaid() external view override returns (uint256) {
        return _abondPaidAt(this.currentTime());
    }

    function abondDebt() external view override returns (uint256) {
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

    function _takeUnderlying(address _from, uint256 _amount) internal virtual;

    function _sendUnderlying(address _to, uint256 _amount)
        internal
        virtual
        returns (bool);

    function _depositProvider(uint256 _underlyingAmount) internal virtual;

    function _withdrawProvider(uint256 _underlyingAmount) internal virtual;
}
