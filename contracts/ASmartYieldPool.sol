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

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "@uniswap/lib/contracts/libraries/FixedPoint.sol";

import "./lib/oracle/YieldOracle.sol";
import "./lib/oracle/IYieldOraclelizable.sol";
import "./lib/math/Math.sol";
import "./ISmartYieldPool.sol";
import "./model/IBondModel.sol";
import "./BondToken.sol";

abstract contract ASmartYieldPool is
    ISmartYieldPool,
    IYieldOraclelizable,
    ERC20
{
    using Counters for Counters.Counter;
    using SafeMath for uint256;

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

    uint256 public BOND_LIFE_MAX = 365 * 2; // in days

    uint256 public underlyingDepositsJuniors;
    uint256 public underlyingWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniors;
    uint256 public tokenWithdrawlsJuniorsAtRisk;

    Counters.Counter private bondIds;

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
    Bond public abond;

    // senior BOND NFT
    BondToken public bondToken;

    IBondModel public seniorModel;

    // is currentCumulativeSecondlyYield() providing correct values?
    bool public _safeToObserve = false;

    modifier executeJuniorWithdrawals {
        // this modifier will be added to all (write) functions.
        // The first tx after a queued liquidation's timestamp will trigger the liquidation
        // reducing the jToken supply, and setting aside owed_dai for withdrawals
        for (
            uint256 i = lastQueuedWithdrawalTimestampsI;
            i < queuedWithdrawalTimestamps.length - 1;
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
        }
        _;
        timestampLast = blockTimestamp;
        underlyingTotalLast = this.underlyingTotal();
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

    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
    {}

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forDays
     * @dev
     */
    function buyBond(uint256 _principalAmount, uint16 _forDays)
        external
        override
        executeJuniorWithdrawals
        returns (uint256)
    {
        require(
            0 < _forDays && _forDays <= BOND_LIFE_MAX,
            "SYABS: buyBond forDays"
        );

        uint256 gain = this.bondGain(_principalAmount, _forDays);

        _takeUnderlying(msg.sender, _principalAmount);
        _depositProvider(_principalAmount);

        return
            _mintBond(
                msg.sender,
                _principalAmount,
                gain,
                this.currentTime(),
                _forDays
            );
    }

    function redeemBond(uint256 _bondId)
        external
        override
        executeJuniorWithdrawals
    {
        require(
            this.currentTime() > bonds[_bondId].maturesAt,
            "SYABS: redeemBond not matured"
        );

        uint256 toPay = bonds[_bondId].gain + bonds[_bondId].principal;

        if (bonds[_bondId].liquidated == false) {
            _unaccountBond(_bondId);
        }

        delete bonds[_bondId];
        bondToken.burn(_bondId);

        _withdrawProvider(toPay);
        _sendUnderlying(bondToken.ownerOf(_bondId), toPay);
    }

    function liquidateBonds(uint256[] memory _bondIds) external override {
        for (uint256 f = 0; f < _bondIds.length; f++) {
            if (this.currentTime() > bonds[_bondIds[f]].maturesAt) {
                bonds[_bondIds[f]].liquidated = true;
                _unaccountBond(_bondIds[f]);
            }
        }
    }

    function buyTokens(uint256 _underlyingAmount)
        external
        override
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
            (this.abondTotal() == 0)
                ? (1 ether)
                : ((this.abondPaid() * (1 ether)) / this.abondTotal());
        uint256 toPay =
            (((_jTokens * unlocked) / (1 ether)) * this.price()) / (1 ether);
        _withdrawJuniors(msg.sender, toPay);
    }

    function withdrawTokensInitiate(uint256 _jTokens)
        external
        override
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

    function _mintBond(
        address _to,
        uint256 _principal,
        uint256 _gain,
        uint256 _startingAt,
        uint16 _forDays
    ) private returns (uint256) {
        bondIds.increment();
        uint256 bondId = bondIds.current();

        uint256 maturesAt = _startingAt.add(uint256(1 days).mul(_forDays));

        bonds[bondId] = Bond(_principal, _gain, _startingAt, maturesAt, false);

        _accountBond(bondId);

        bondToken.mint(_to, bondId);
        return bondId;
    }

    function _accountBond(uint256 _bondId) private {
        Bond storage b = bonds[_bondId];

        uint256 nGain = abond.gain + b.gain;
        uint256 shift =
            ((abond.gain *
                b.gain *
                (b.issuedAt - abond.issuedAt) *
                (abond.maturesAt - abond.issuedAt + b.maturesAt - b.issuedAt)) /
                (abond.maturesAt - abond.issuedAt)) *
                nGain *
                nGain;

        abond.issuedAt =
            (abond.issuedAt * abond.gain + b.issuedAt * b.gain) /
            nGain -
            shift;
        abond.maturesAt =
            (abond.maturesAt * abond.gain + b.maturesAt * b.gain) /
            nGain -
            shift;
        abond.gain = nGain;
        abond.principal += b.principal;
    }

    function _unaccountBond(uint256 _bondId) private {
        Bond storage b = bonds[_bondId];

        uint256 nGain = abond.gain - b.gain;

        if (0 == nGain) {
            // last bond
            abond.issuedAt = 0;
            abond.maturesAt = 0;
            abond.gain = 0;
            abond.principal = 0;
            return;
        }
        uint256 shift =
            ((abond.gain *
                b.gain *
                (b.issuedAt - abond.issuedAt) *
                (abond.maturesAt - abond.issuedAt + b.maturesAt - b.issuedAt)) /
                (abond.maturesAt - abond.issuedAt)) *
                nGain *
                nGain;

        abond.issuedAt =
            (abond.issuedAt * abond.gain - b.issuedAt * b.gain) /
            nGain +
            shift;
        abond.maturesAt =
            (abond.maturesAt * abond.gain - b.maturesAt * b.gain) /
            nGain +
            shift;
        abond.gain = nGain;
        abond.principal -= b.principal;
    }

    function abondTotal() external view override returns (uint256) {
        return abond.gain;
    }

    function abondPaid() external view override returns (uint256) {
        uint256 d = abond.maturesAt - abond.issuedAt;
        return
            (abond.gain * Math.min(this.currentTime() - abond.issuedAt, d)) / d;
    }

    function abondDebt() external view override returns (uint256) {
        return abond.gain - this.abondPaid();
    }

    function _takeTokens(address _from, uint256 _amount)
        internal
        returns (bool)
    {
        require(
            _amount <= allowance(_from, address(this)),
            "ASYP: _takeTokens allowance"
        );
        return transferFrom(_from, address(this), _amount);
    }

    function underlyingDecimals()
        external
        view
        virtual
        override
        returns (uint256);

    function _takeUnderlying(address _from, uint256 _amount)
        internal
        virtual
        returns (bool);

    function _sendUnderlying(address _to, uint256 _amount)
        internal
        virtual
        returns (bool);

    function _depositProvider(uint256 _underlyingAmount) internal virtual;

    function _withdrawProvider(uint256 _underlyingAmount) internal virtual;
}
