// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.5;

interface ISmartYieldPool {

    // a senior BOND (metadata for NFT)
    struct SeniorBond {
        // amount seniors put in
        uint256 principal;
        // amount yielded at the end. total = principal + gain
        uint256 gain;
        // bond was issued at timestamp
        uint256 issuedAt;
        // bond matures at timestamp
        uint256 maturesAt;
        // was it liquidated yet
        bool liquidated;
    }

    // a junior BOND (metadata for NFT)
    struct JuniorBond {
        // amount of tokens (jTokens) junior put in
        uint256 tokens;
        // bond matures at timestamp
        uint256 maturesAt;
    }

    // a checkpoint for all JuniorBonds with same maturity date JuniorBond.maturesAt
    struct JuniorBondsAt {
        // sum of JuniorBond.tokens for JuniorBonds with the same JuniorBond.maturesAt
        uint256 tokens;
        // price at which JuniorBonds will be paid. Initially 0 -> unliquidated (price is in the future or not yet liquidated)
        uint256 price;
    }

    struct Storage {
      // pool state / average bond
      // holds rate of payment by juniors to seniors
      SeniorBond abond;

      // previously measured total underlying
      uint256 underlyingTotalLast;

      // CUMULATIVE
      // cumulates (new yield per second) * (seconds since last cumulation)
      uint256 cumulativeSecondlyYieldLast;
      // cummulates balanceOf underlying
      uint256 cumulativeUnderlyingTotalLast;
      // timestamp of the last cumulation
      uint32 timestampLast;
      // /CUMULATIVE

      // fees colected in underlying
      uint256 underlyingFees;

      // underlying amount in matured and liquidated juniorBonds
      uint256 underlyingLiquidatedJuniors;

      // tokens amount in unmatured juniorBonds or matured and unliquidated
      uint256 tokensInJuniorBonds;

      // latest SeniorBond Id
      uint256 seniorBondId;

      // latest JuniorBond Id
      uint256 juniorBondId;

      // last index of juniorBondsMaturities that was liquidated
      uint256 juniorBondsMaturitiesPrev;
      // list of junior bond maturities (timestamps)
      uint256[] juniorBondsMaturities;

      // checkpoints for all JuniorBonds matureing at (timestamp) -> (JuniorBondsAt)
      // timestamp -> JuniorBondsAt
      mapping(uint256 => JuniorBondsAt) juniorBondsMaturingAt;

      // metadata for senior bonds
      // bond id => bond (SeniorBond)
      mapping(uint256 => SeniorBond) seniorBonds;

      // metadata for junior bonds
      // bond id => bond (JuniorBond)
      mapping(uint256 => JuniorBond) juniorBonds;
    }

    function abond() external view returns(uint256 principal, uint256 gain, uint256 issuedAt, uint256 maturesAt, bool liquidated);

    function seniorBonds(uint256 id) external view returns(uint256 principal, uint256 gain, uint256 issuedAt, uint256 maturesAt, bool liquidated);

    function buyBond(uint256 _principalAmount, uint256 _minGain, uint256 _deadline, uint16 _forDays) external;

    function redeemBond(uint256 _bondId) external;

    function unaccountBonds(uint256[] memory _bondIds) external;

    function buyTokens(uint256 _underlyingAmount, uint256 _minTokens, uint256 _deadline) external;

    /**
     * sell all tokens instantly
     */
    function sellTokens(uint256 _tokens, uint256 _minUnderlying, uint256 _deadline) external;

    function buyJuniorBond(uint256 tokenAmount_, uint256 maxMaturesAt_, uint256 deadline_) external;

    function redeemJuniorBond(uint256 jBondId_) external;

    /**
     * token purchase price
     */
    function price() external view returns (uint256);

    function abondPaid() external view returns (uint256);

    function abondDebt() external view returns (uint256);

    function abondGain() external view returns (uint256);

    /**
     * @notice current total underlying balance, without accruing interest
     */
    function underlyingTotal() external view returns (uint256);

    /**
     * @notice current underlying loanable, without accruing interest
     */
    function underlyingLoanable() external view returns (uint256);

    function underlyingJuniors() external view returns (uint256);

    function providerRatePerDay() external view returns (uint256);

    function bondGain(uint256 _principalAmount, uint16 _forDays)
        external
        view
        returns (uint256);

    function harvest() external;

    function transferFees() external;
}
