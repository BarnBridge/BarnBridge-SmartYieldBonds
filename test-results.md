``` shell
  AAVE flow tests
---------
AAVE APY          : 0.077462
underlyingBalance : 99700884264
underlyingFees    : 300000000
underlyingFull    : 100000884264
sy provider APY   : 0.077461
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.077461 0.077462 0.300000
sy spot APY (supply + distri) : 0.077462 (0.077462 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 1793147566627631
---------
gain      : 31775544
principal : 100000000000
issuedAt  : 1619783458999999999999999999
maturesAt : 1620042659000000000000000000
---------
AAVE APY          : 0.078342
underlyingBalance : 618
underlyingFees    : 303877908
underlyingFull    : 303878526
sy provider APY   : 0.076536
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.076536 0.078342 0.300000
sy spot APY (supply + distri) : 0.078342 (0.078342 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 333564869542760623
---------
---------
AAVE APY          : 0.078342
underlyingBalance : 619
underlyingFees    : 303877908
underlyingFull    : 303878527
sy provider APY   : 0.076537
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.076537 0.078342 0.300000
sy spot APY (supply + distri) : 0.078342 (0.078342 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 0
---------
    √ yield and price movements (101429ms)
    √ AAVE switch controller (9423ms)

  AaveProvider
    _depositProvider() / _withdrawProvider()
      √ system should be in expected state (853ms)
      √ only smartYield can call _depositProvider/_withdrawProvider (1000ms)
      √ _depositProvider deposits to provider (1682ms)
    _takeUnderlying() / _sendUnderlying()
      √ system should be in expected state (852ms)
      √ only smartYield can call _takeUnderlying/_sendUnderlying (975ms)
      √ _takeUnderlying takes underlying & checks for allowance (1330ms)
      √ _sendUnderlying sends underlying (1135ms)
    transferFees()
      √ transfers fees to feesOwner (2284ms)
    claimRewardsTo()
      √ transfer rewards to rewardsColector (944ms)
    setController()
      √ only controller or DAO can change controller (2508ms)

  abond value computations
    √ should deploy contracts correctly (4645ms)
    first and last bond
      √ for one bond, abond is the same (8983ms)
      √ for new bonds, abondPaid stays the same (10498ms)
      √ last bond, is abond (9325ms)
      √ for bonds redeemed, abondDebt stays the same (11303ms)

  buyBond() / redeemBond()
    √ should deploy contracts correctly (8377ms)
    √ MathUtils.compound / MathUtils.compound2 works (10159ms)
    buyBond()
      √ buyBond require forDays / minGain / allowance (11784ms)
      √ buyBond creates a correct bond token (9189ms)
      √ buyBond creates several correct bond tokens (9995ms)
    redeemBond()
      √ redeemBond require matured, unredeemed (9101ms)
      √ redeemBond gives correct amounts (9904ms)
      √ redeemBond gives amounts to owner (9258ms)

  BondModel v2
    bondModel MAX_POOL_RATIO
      √ setting it works (1314ms)
    bondModel.maxDailyRate()
      √ expected values (1380ms)
    bondModel.gain() linear
      √ expected values (1438ms)
    bondModel.gain() compounded
      √ expected values (1626ms)

  BondModel bond rate computations
    bondModel.maxDailyRate()
      √ expected values (671ms)
    bondModel.gain()
      √ expected values (794ms)

  CompoundProvider._depositProvider() / CompoundProvider._withdrawProvider()
    √ system should be in expected state (6133ms)
    √ only smartYield can call _depositProvider/_withdrawProvider (6152ms)
    √ _depositProvider deposits to provider (7150ms)

  CompoundProvider._takeUnderlying() / CompoundProvider._sendUnderlying()
    √ system should be in expected state (6067ms)
    √ only smartYield can call _takeUnderlying/_sendUnderlying (6243ms)
    √ _takeUnderlying takes underlying & checks for allowance (6544ms)
    √ _sendUnderlying sends underlying (6475ms)

  Controller
    √ should deploy contracts correctly (11928ms)
    testing Icontroller and Governed
      √ Icontroller (11489ms)
      √ Governed (11344ms)

  COMPOUND flow tests
---------
compound APY    : 0.029319
underlyingBalance : 99700329895
underlyingFees    : 300000000
underlyingFull : 100000329895
sy provider APY : 0.049683
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.050592 0.049683 0.300000
sy spot APY (supply + distri) : 0.049683 (0.029319 + 0.020618)
harvestReward   : 17917
harvestCompGot   : 362559154050825
---------
gain      : 19895268
principal : 100000000000
issuedAt  : 1653321759999999999999999999
maturesAt : 1653580960000000000000000000
    √ yield and price movements (163875ms)
    √ switch controller (32552ms)

  CompoundController.harvest()
    √ happy path with full harvest (5567ms)
    √ happy path with partial harvest (8335ms)
    √ happy path with more harvest than available (6619ms)
    √ reverts if uniswap price/slippage is below/more than HARVEST_COST (5261ms)
    √ reverts if claimComp gives 0 (5323ms)

  junior bonds: buyJuniorBond()
    purchase junior bonds
      √ buyJuniorBond works if abond maturesAt is in the past (13356ms)
      √ barnbridge oz c01 example test (11032ms)
      √ liquidation works (13570ms)
      √ junior bond redeem (11409ms)
      √ redeemJuniorBond() can return less than sellToken() extreme conditions (13118ms)
      √ junior gets jbond (9545ms)
      √ when buying jBonds juniorBondsMaturities is properly sorted (12951ms)

  tokens: buyTokens()
    √ should deploy contracts correctly (8663ms)
    instant withdraw
      √ if there's debt, it is forfeit (10142ms)
      √ if there's debt, it is forfeit with multiple juniors (9849ms)
    buyTokens
      √ junior gets tokens (8920ms)
    price
      √ yield decreases after buyBond, price goes down (9417ms)
      √ yield increases after buyBond, price goes up (9561ms)
      √ price doesn't change before and after buyTokens (9293ms)
      √ price doesn't change before and after buyBond (9240ms)
      √ with no yield price stays the same (9367ms)


  64 passing (12m)

-------------------------------------------------|----------|----------|----------|----------|----------------|
File                                             |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-------------------------------------------------|----------|----------|----------|----------|----------------|
 contracts\                                      |    95.29 |     64.1 |    94.34 |    94.95 |                |
  Governed.sol                                   |      100 |      100 |      100 |      100 |                |
  IBond.sol                                      |      100 |      100 |      100 |      100 |                |
  IController.sol                                |    84.62 |        0 |       90 |    84.62 |          48,52 |
  IProvider.sol                                  |      100 |      100 |      100 |      100 |                |
  ISmartYield.sol                                |      100 |      100 |      100 |      100 |                |
  JuniorBond.sol                                 |      100 |       50 |      100 |      100 |                |
  JuniorToken.sol                                |      100 |      100 |      100 |      100 |                |
  SeniorBond.sol                                 |      100 |       50 |      100 |      100 |                |
  SmartYield.sol                                 |    95.65 |    65.63 |    93.55 |    95.18 |... 580,581,691 |
 contracts\external-interfaces\aave\             |      100 |      100 |      100 |      100 |                |
  IAToken.sol                                    |      100 |      100 |      100 |      100 |                |
  ILendingPool.sol                               |      100 |      100 |      100 |      100 |                |
  IStakedTokenIncentivesController.sol           |      100 |      100 |      100 |      100 |                |
 contracts\external-interfaces\compound-finance\ |      100 |      100 |      100 |      100 |                |
  ICToken.sol                                    |      100 |      100 |      100 |      100 |                |
  IComptroller.sol                               |      100 |      100 |      100 |      100 |                |
  IUniswapAnchoredOracle.sol                     |      100 |      100 |      100 |      100 |                |
 contracts\external-interfaces\uniswap\          |      100 |      100 |      100 |      100 |                |
  IUniswapV2Router.sol                           |      100 |      100 |      100 |      100 |                |
 contracts\lib\math\                             |      100 |      100 |      100 |      100 |                |
  MathUtils.sol                                  |      100 |      100 |      100 |      100 |                |
 contracts\model\                                |    96.43 |    91.67 |      100 |    96.43 |                |
  ABondModelV2.sol                               |     87.5 |       75 |      100 |     87.5 |             53 |
  BondModelV1.sol                                |      100 |      100 |      100 |      100 |                |
  BondModelV2Compounded.sol                      |      100 |      100 |      100 |      100 |                |
  BondModelV2Linear.sol                          |      100 |      100 |      100 |      100 |                |
  IBondModel.sol                                 |      100 |      100 |      100 |      100 |                |
 contracts\oracle\                               |    96.43 |       70 |      100 |    96.43 |                |
  IYieldOracle.sol                               |      100 |      100 |      100 |      100 |                |
  IYieldOraclelizable.sol                        |      100 |      100 |      100 |      100 |                |
  YieldOracle.sol                                |    96.43 |       70 |      100 |    96.43 |            142 |
 contracts\providers\                            |    97.14 |    72.73 |    97.01 |    96.86 |                |
  AaveController.sol                             |      100 |     87.5 |      100 |      100 |                |
  AaveProvider.sol                               |      100 |       75 |      100 |      100 |                |
  CompoundController.sol                         |      100 |       80 |      100 |      100 |                |
  CompoundProvider.sol                           |    87.72 |    59.09 |    88.89 |    86.89 |... 216,218,220 |
  IAaveCumulator.sol                             |      100 |      100 |      100 |      100 |                |
  ICompoundCumulator.sol                         |      100 |      100 |      100 |      100 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|
All files                                        |    96.48 |    70.93 |     96.4 |    96.21 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|

> Istanbul reports written to ./coverage/ and ./coverage.json

```
