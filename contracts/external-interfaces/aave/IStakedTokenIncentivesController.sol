pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

interface IStakedTokenIncentivesController {

  function REWARD_TOKEN() external view returns (address);

  function claimRewards(
    address[] calldata assets,
    uint256 amount,
    address to
  ) external returns (uint256);

}
