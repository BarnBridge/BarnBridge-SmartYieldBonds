// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

// TODO:
// comp value
// suspend trading
// fees
// dao, settings

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import "./lib/math/Math.sol";
import "./ISmartYieldPool.sol";
import "./BondToken.sol";

abstract contract ASmartYieldPool is ISmartYieldPool, ERC20 {
    using Counters for Counters.Counter;
    using SafeMath for uint256;

    uint256 public BOND_LIFE_MAX = 365 * 2; // in days

    Counters.Counter private bondIds;

    // bond id => bond (Bond)
    mapping(uint256 => Bond) public bonds;

    // pool state / average bond
    Bond public abond;

    // senior BOND NFT
    BondToken public bondToken;

    uint256 public underlyingDepositsJuniors;
    uint256 public underlyingWithdrawlsJuniors;

    constructor(string memory name, string memory symbol)
        ERC20(name, symbol)
    {}

    /**
     * @notice Purchase a senior bond with principalAmount underlying for forDays
     * @dev
     */
    function buyBond(uint256 _principalAmount, uint16 _forDays)
        external
        override
        returns (uint256)
    {
        require(
            0 < _forDays && _forDays <= BOND_LIFE_MAX,
            "SYABS: buyBond forDays"
        );

        uint256 gain = this.bondGain(_principalAmount, _forDays);

        takeUnderlying(msg.sender, _principalAmount);
        depositProvider(_principalAmount);

        return
            mintBond(
                msg.sender,
                _principalAmount,
                gain,
                block.timestamp,
                _forDays
            );
    }

    function redeemBond(uint256 _bondId) external override {
        require(
            block.timestamp > bonds[_bondId].maturesAt,
            "SYABS: redeemBond not matured"
        );

        uint256 toPay = bonds[_bondId].gain + bonds[_bondId].principal;

        if (bonds[_bondId].liquidated == false) {
          unaccountBond(_bondId);
        }

        delete bonds[_bondId];
        bondToken.burn(_bondId);

        withdrawProvider(toPay);
        sendUnderlying(bondToken.ownerOf(_bondId), toPay);
    }

    function liquidateBonds(uint256[] memory _bondIds) external override {
      for (uint256 f=0; f<_bondIds.length; f++) {
        if (block.timestamp > bonds[_bondIds[f]].maturesAt) {
          bonds[_bondIds[f]].liquidated = true;
          unaccountBond(_bondIds[f]);
        }
      }
    }

    function buyTokens(uint256 _underlyingAmount) external override {
        takeUnderlying(msg.sender, _underlyingAmount);
        depositProvider(_underlyingAmount);
        underlyingDepositsJuniors += _underlyingAmount;
        _mint(msg.sender, _underlyingAmount / this.price());
    }

    function sellTokens(uint256 _jTokens) external override {
        _burn(msg.sender, _jTokens);
        uint256 unlocked = (this.abondTotal() == 0) ? (1 ether) : (this.abondPaid() * (1 ether) / this.abondTotal());
        uint256 toPay = _jTokens * unlocked / (1 ether) * this.price() / (1 ether);
        uint256 toQueue = _jTokens * this.price() / (1 ether) - toPay;
        underlyingWithdrawlsJuniors += toQueue;
        withdrawProvider(toPay);
        sendUnderlying(msg.sender, toPay);

        // TODO: enqueue withdraw
    }

    function price() external override view returns (uint256) {
        uint256 ts = totalSupply();
        return (ts == 0) ? 1 : this.underlyingJuniors() * (1 ether) / ts;
    }

    function underlyingJuniors() external override view returns (uint256) {
        // TODO: fees
        // underlyingTotal - abond.principal - debt paid - queued withdrawls
        return this.underlyingTotal() - abond.principal - this.abondPaid() - underlyingWithdrawlsJuniors;
    }

    function mintBond(
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

        accountBond(bondId);

        bondToken.mint(_to, bondId);
        return bondId;
    }

    function accountBond(uint256 _bondId) private {
        Bond storage b = bonds[_bondId];

        uint256 nGain = abond.gain + b.gain;
        uint256 shift = abond.gain * b.gain * (b.issuedAt - abond.issuedAt) * (abond.maturesAt - abond.issuedAt + b.maturesAt - b.issuedAt) / (abond.maturesAt - abond.issuedAt) * nGain * nGain;

        abond.issuedAt = (abond.issuedAt * abond.gain + b.issuedAt * b.gain) / nGain - shift;
        abond.maturesAt = (abond.maturesAt * abond.gain + b.maturesAt * b.gain) / nGain - shift;
        abond.gain = nGain;
        abond.principal += b.principal;
    }

    function unaccountBond(uint256 _bondId) private {
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
        uint256 shift = abond.gain * b.gain * (b.issuedAt - abond.issuedAt) * (abond.maturesAt - abond.issuedAt + b.maturesAt - b.issuedAt) / (abond.maturesAt - abond.issuedAt) * nGain * nGain;

        abond.issuedAt = (abond.issuedAt * abond.gain - b.issuedAt * b.gain) / nGain + shift;
        abond.maturesAt = (abond.maturesAt * abond.gain - b.maturesAt * b.gain) / nGain + shift;
        abond.gain = nGain;
        abond.principal -= b.principal;
    }

    function abondTotal() external override view returns (uint256) {
        return abond.gain;
    }

    function abondPaid() external override view returns (uint256) {
        uint256 d = abond.maturesAt - abond.issuedAt;
        return (abond.gain * Math.min(block.timestamp - abond.issuedAt, d)) / d;
    }

    function abondDebt() external override view returns (uint256) {
        return abond.gain - this.abondPaid();
    }

    function takeUnderlying(address _from, uint256 _amount)
        internal
        virtual
        returns (bool);

    function sendUnderlying(address _to, uint256 _amount)
        internal
        virtual
        returns (bool);

    function depositProvider(uint256 _underlyingAmount) internal virtual;

    function withdrawProvider(uint256 _underlyingAmount) internal virtual;
}
