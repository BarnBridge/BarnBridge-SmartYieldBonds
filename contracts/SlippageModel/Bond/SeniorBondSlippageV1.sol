// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.6.0;

import "./IBondSlippageModel.sol";
import "../../lib/math/Math.sol";

contract SeniorBondSlippageV1 is IBondSlippageModel {
    function slippage(
      uint256 principal,
      uint256 ratePerBlock,
      uint256 forDays,
      uint256 seniorTotal,
      uint256 juniorTotal
    ) external pure returns (uint256) {
      // TODO: REVIEW &/ CHANGE
      return (-principal - juniorTotal - seniorTotal + Math.sqrt((principal + juniorTotal + seniorTotal)^2 + 4 * principal * juniorTotal * n^2 * t))/(2 * principal * n * t);
    }
}
