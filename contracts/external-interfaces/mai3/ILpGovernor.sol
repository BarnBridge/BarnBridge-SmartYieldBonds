pragma solidity ^0.7.6;
pragma experimental ABIEncoderV2;

interface ILpGovernor {
    function castVote(uint256 proposalId, bool support) external;

    function earned(address account) external view returns (uint256);

    function getReward() external;

    function rewardToken() external view returns (address);

    function rewardRate() external view returns (uint256);
}
