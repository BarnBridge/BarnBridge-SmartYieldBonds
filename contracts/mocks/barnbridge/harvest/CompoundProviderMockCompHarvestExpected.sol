// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "hardhat/console.sol";

import "./../../../providers/CompoundProvider.sol";

contract CompoundProviderMockCompHarvestExpected is CompoundProvider {

  function harvest()
    public override
  {

    uint256 rewardBefore = IERC20(rewardCToken).balanceOf(address(this)); // COMP

    address[] memory holders = new address[](1);
    holders[0] = address(this);
    address[] memory markets = new address[](1);
    markets[0] = cToken;

    IComptroller(comptroller).claimComp(holders, markets, false, true);

    uint256 rewardExpected = compRewardExpected(); // COMP

    _updateCompState(cTokenBalance);
    compState.compRewardExpectedLast = 0;

    uint256 rewardGot = IERC20(rewardCToken).balanceOf(address(this)); // COMP

    console.log("CompoundProviderMockCompHarvestExpected.harvest() rewardExpected=", rewardExpected);
    console.log("CompoundProviderMockCompHarvestExpected.harvest() diff          =", (rewardGot - rewardBefore));
    console.log("CompoundProviderMockCompHarvestExpected.harvest() rewardGot     =", rewardGot);
    console.log("CompoundProviderMockCompHarvestExpected.harvest() rewardBefore  =", rewardBefore);

    require(
      rewardExpected == (rewardGot - rewardBefore),
      "HARVEST TEST FAILED"
    );
  }


}
