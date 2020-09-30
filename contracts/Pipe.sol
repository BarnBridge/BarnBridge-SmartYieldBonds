// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "./SmartYieldBond.sol";
import "./SmartYieldToken.sol";

contract Pipe {
    SmartYieldBond bond;

    SmartYieldToken tokenSenior;
    SmartYieldToken tokenJunior;

    struct Player {
        address wallet;
        uint256 amount;
    }

    Player[] juniors;
    Player[] seniors;

    constructor() public {}

    function setup(
        address _bond,
        address _tokenSenior,
        address _tokenJunior
    ) public {
        bond = SmartYieldBond(_bond);
        tokenSenior = SmartYieldToken(_tokenSenior);
        tokenJunior = SmartYieldToken(_tokenJunior);
    }

    function _isSetup() internal view {
        require(
            address(bond) != address(0) &&
                address(tokenSenior) != address(0) &&
                address(tokenJunior) != address(0)
        );
    }
}
