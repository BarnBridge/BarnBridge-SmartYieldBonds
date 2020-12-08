// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;


// TODO:
// suspend trading
// fees
// dao, settings


import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "./ISmartYieldPool.sol";
import "./SeniorBondToken.sol";

abstract contract ASmartYieldPool is ISmartYieldPool, ERC20 {

    using Counters for Counters.Counter;


    uint256 public BOND_LIFE_MAX = 365 * 2; // in days

    Counters.Counter private bondIds;

    // bond id => bond (Bond)
    mapping(uint256 => Bond) public bonds;

    // pool state / average bond
    Bond public abond;

    // senior BOND NFT
    SeniorBondToken public bondToken;

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
        uint256 gain = this.bondGain(_principalAmount, _forDays);

        takeUnderlying(msg.sender, _principalAmount);
        depositProvider(_principalAmount);

        require(
            0 < _forDays && _forDays <= BOND_LIFE_MAX,
            "SYABS: buyBond forDays"
        );

        return
            mintBond(
                msg.sender,
                _principalAmount,
                gain,
                block.timestamp,
                _forDays
            );
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
      abond.gain = abond.gain.add(b.gain);
      abond.principal = abond.principal.add(b.principal);

      // TODO: shift time
    }

    function unaccountBond(uint256 _bondId) private {
      Bond storage b = bonds[_bondId];

      // TODO: shift time

      abond.gain = abond.gain.sub(b.gain);
      abond.principal = abond.principal.sub(b.principal);

    }

    function takeUnderlying(address from, uint256 amount)
        internal
        virtual
        returns (bool);

    function sendUnderlying(address to, uint256 amount)
        internal
        virtual
        returns (uint256);

    function depositProvider(uint256 underlyingAmount)
        internal
        virtual
        returns (uint256);

    function withdrawProvider(uint256 underlyingAmount)
        internal
        virtual
        returns (uint256);

    function bondGain(
        uint256 principalAmount,
        uint16 forDays
    ) public virtual view returns (uint256);
}
