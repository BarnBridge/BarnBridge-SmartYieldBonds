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
import "./SeniorBondToken.sol";

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
    SeniorBondToken public bondToken;

    uint256 public underlyingDepositsJuniors;

    constructor(string memory name, string memory symbol)
        public
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

        uint256 amount = bonds[_bondId].gain.add(bonds[_bondId].principal);

        withdrawProvider(amount);
        sendUnderlying(bondToken.ownerOf(_bondId), amount);

        unaccountBond(_bondId);

        delete bonds[_bondId];
        bondToken.burn(_bondId);
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
        withdrawProvider(toPay);
        sendUnderlying(msg.sender, toPay);

        // TODO: enqueue withdraw
    }

    function price() external override view returns (uint256) {
        uint256 ts = totalSupply();
        return (ts == 0) ? 1 : this.underlyingJuniors() * (1 ether) / totalSupply();
    }

    function underlyingJuniors() external override view returns (uint256) {
        // TODO: fees
        // underlyingTotal - abond.principal - debt paid
        return this.underlyingTotal() - abond.principal - this.abondPaid();
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

        bonds[bondId] = Bond(_principal, _gain, _startingAt, maturesAt);

        accountBond(bondId);

        bondToken.mint(_to, bondId);
        return bondId;
    }

    function accountBond(uint256 _bondId) private {
        Bond storage b = bonds[_bondId];

        abond.issuedAt = abond
            .issuedAt
            .mul(abond.gain)
            .add(b.issuedAt.mul(b.gain))
            .div(abond.gain.add(b.gain));
        abond.maturesAt = abond
            .maturesAt
            .mul(abond.gain)
            .add(b.maturesAt.mul(b.gain))
            .div(abond.gain.add(b.gain));
        abond.gain = abond.gain.add(b.gain);
        abond.principal = abond.principal.add(b.principal);

        // TODO: shift time
    }

    function unaccountBond(uint256 _bondId) private {
        Bond storage b = bonds[_bondId];

        // TODO: shift time

        abond.issuedAt = abond
            .issuedAt
            .mul(abond.gain)
            .sub(b.issuedAt.mul(b.gain))
            .div(abond.gain.sub(b.gain));
        abond.maturesAt = abond
            .maturesAt
            .mul(abond.gain)
            .sub(b.maturesAt.mul(b.gain))
            .div(abond.gain.sub(b.gain));
        abond.gain = abond.gain.sub(b.gain);
        abond.principal = abond.principal.sub(b.principal);
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
