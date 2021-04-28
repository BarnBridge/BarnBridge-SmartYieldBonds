pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

interface IStakedTokenIncentivesController {

  function claimRewards(
    address[] calldata assets,
    uint256 amount,
    address to
  ) external returns (uint256);

}
