// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SmartYieldBond {

    IERC20 public assetToken;

    // feeds or drains funds
    address public pipe;

    // 100 = 100%
    uint8 public tranchSenior;
    // 1_000_000 = 100%
    uint24 public yieldSenior;

    uint public maturesAt;

    constructor(
        address _assetToken,
        address _pipe,
        uint8 _tranchSenior,
        uint24 _yieldSenior,
        uint _maturesAt
    ) public {
        assetToken = IERC20(_assetToken);
        pipe = _pipe;
        tranchSenior = _tranchSenior;
        yieldSenior = _yieldSenior;
        maturesAt = _maturesAt;
    }

    function hasMatured() public view returns (bool) {
        return block.timestamp >= maturesAt;
    }


}