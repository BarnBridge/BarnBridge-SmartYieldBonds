// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.7.6;
pragma abicoder v2;

import "./Governed.sol";

contract IController is Governed {

    address public oracle; // IYieldOracle

    address public bondModel; // IBondModel

    address public feesOwner; // fees are sent here

    // reward for calling harvest 3%
    uint256 public HARVEST_REWARD = 30 * 1e15; // 3%

    // fee for buying jTokens
    uint256 public FEE_BUY_JUNIOR_TOKEN = 3 * 1e15; // 0.3%

    // fee for redeeming a sBond
    uint256 public FEE_REDEEM_SENIOR_BOND = 100 * 1e15; // 10%

    // max rate per day for sBonds
    // k * supplyRatePerBlock * blocksPerDay
    uint256 public BOND_MAX_RATE_PER_DAY = 3 * 49201150733 * 5760; // APY ~30% / year

    // max duration of a purchased sBond
    uint16 public BOND_LIFE_MAX = 90; // in days

    bool public PAUSED_BUY_JUNIOR_TOKEN = false;

    bool public PAUSED_BUY_SENIOR_BOND = false;

    constructor() Governed() { }

    function setHarvestReward(uint256 newValue_)
      public
      onlyDaoOrGuardian
    {
        HARVEST_REWARD = newValue_;
    }

    function setBondMaxRatePerDay(uint256 newVal_)
      external
      onlyDaoOrGuardian
    {
      BOND_MAX_RATE_PER_DAY = newVal_;
    }

    function setBondLifeMax(uint16 newVal_)
      external
      onlyDaoOrGuardian
    {
      BOND_LIFE_MAX = newVal_;
    }

    function setFeeBuyJuniorToken(uint256 newVal_)
      external
      onlyDaoOrGuardian
    {
      FEE_BUY_JUNIOR_TOKEN = newVal_;
    }

    function setFeeRedeemSeniorBond(uint256 newVal_)
      external
      onlyDaoOrGuardian
    {
      FEE_REDEEM_SENIOR_BOND = newVal_;
    }

    function setPaused(bool buyJToken_, bool buySBond_)
      external
      onlyDaoOrGuardian
    {
      PAUSED_BUY_JUNIOR_TOKEN = buyJToken_;
      PAUSED_BUY_SENIOR_BOND = buySBond_;
    }

    function setOracle(address newVal_)
      external
      onlyDaoOrGuardian
    {
      oracle = newVal_;
    }

    function setBondModel(address newVal_)
      external
      onlyDaoOrGuardian
    {
      bondModel = newVal_;
    }

    function setFeesOwner(address newVal_)
      external
      onlyDaoOrGuardian
    {
      feesOwner = newVal_;
    }
}
