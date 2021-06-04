``` shell
  AAVE flow tests
---------
AAVE APY          : 0.068004
underlyingBalance : 99700776301
underlyingFees    : 300000000
underlyingFull    : 100000776301
sy provider APY   : 0.068004
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.068004 0.068004 0.300000
sy spot APY (supply + distri) : 0.068004 (0.068004 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 1219567866227465
---------
gain      : 27897028
principal : 100000000000
issuedAt  : 1620558223999999999999999999
maturesAt : 1620817424000000000000000000
---------
AAVE APY          : 0.068686
underlyingBalance : 652
underlyingFees    : 303405545
underlyingFull    : 303406197
sy provider APY   : 0.067357
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.067357 0.068686 0.300000
sy spot APY (supply + distri) : 0.068686 (0.068686 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 226887531996510131
---------
---------
AAVE APY          : 0.068686
underlyingBalance : 653
underlyingFees    : 303405545
underlyingFull    : 303406198
sy provider APY   : 0.067357
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.067357 0.068686 0.300000
sy spot APY (supply + distri) : 0.068686 (0.068686 + 0.000000)
harvestReward     : 0
harvestStkAAVEGot : 0
---------
    √ yield and price movements (105887ms)
    √ AAVE switch controller (10459ms)

  AaveProvider
    _depositProvider() / _withdrawProvider()
      √ system should be in expected state (1147ms)
      √ only smartYield can call _depositProvider/_withdrawProvider (1290ms)
      √ _depositProvider deposits to provider (2034ms)
    _takeUnderlying() / _sendUnderlying()
      √ system should be in expected state (1134ms)
      √ only smartYield can call _takeUnderlying/_sendUnderlying (1224ms)
      √ _takeUnderlying takes underlying & checks for allowance (1581ms)
      √ _sendUnderlying sends underlying (1405ms)
    transferFees()
      √ transfers fees to feesOwner (2593ms)
    claimRewardsTo()
      √ transfer rewards to rewardsColector (1165ms)
    setController()
      √ only controller or DAO can change controller (1125ms)

  abond value computations
    √ should deploy contracts correctly (1514ms)
    first and last bond
      √ for one bond, abond is the same (1975ms)
      √ for new bonds, abondPaid stays the same (3620ms)
      √ last bond, is abond (2481ms)
      √ for bonds redeemed, abondDebt stays the same (4300ms)

  buyBond() / redeemBond()
    √ should deploy contracts correctly (1434ms)
    √ MathUtils.compound / MathUtils.compound2 works (2469ms)
    buyBond()
      √ buyBond require forDays / minGain / allowance (5059ms)
      √ buyBond creates a correct bond token (2196ms)
      √ buyBond creates several correct bond tokens (2866ms)
    redeemBond()
      √ redeemBond require matured, unredeemed (2185ms)
      √ redeemBond gives correct amounts (2929ms)
      √ redeemBond gives amounts to owner (2389ms)

  BondModel v2
    bondModel MAX_POOL_RATIO
      √ setting it works (298ms)
    bondModel.maxDailyRate()
      √ expected values (344ms)
    bondModel.gain() linear
      √ expected values (444ms)
    bondModel.gain() compounded
      √ expected values (581ms)

  BondModel bond rate computations
    bondModel.maxDailyRate()
      √ expected values (118ms)
    bondModel.gain()
      √ expected values (313ms)

  CompoundProvider._depositProvider() / CompoundProvider._withdrawProvider()
    √ system should be in expected state (1214ms)
    √ only smartYield can call _depositProvider/_withdrawProvider (1302ms)
    √ _depositProvider deposits to provider (2294ms)

  CompoundProvider._takeUnderlying() / CompoundProvider._sendUnderlying()
    √ system should be in expected state (1265ms)
    √ only smartYield can call _takeUnderlying/_sendUnderlying (1449ms)
    √ _takeUnderlying takes underlying & checks for allowance (1786ms)
    √ _sendUnderlying sends underlying (1528ms)

  Controller
    √ should deploy contracts correctly (1542ms)
    testing Icontroller and Governed
      √ Icontroller (9261ms)
      √ Governed (1697ms)

  CREAM flow tests
---------
CREAM APY         : 0.111152
underlyingBalance : 99701203329
underlyingFees    : 300000000
underlyingFull    : 100001203329
sy provider APY   : 0.111107
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.111107 0.111152 0.300000
sy spot APY (supply + distri) : 0.111152 (0.111152 + 0.000000)
harvestReward     : 0
harvestCompGot    : 0
---------
gain      : 43242824
principal : 100000000000
issuedAt  : 1654096486999999999999999999
maturesAt : 1654355687000000000000000000
---------
CREAM APY         : 0.114191
underlyingBalance : 12553
underlyingFees    : 305261833
underlyingFull    : 305274386
sy provider APY   : 0.108931
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.108931 0.114191 0.300000
sy spot APY (supply + distri) : 0.114191 (0.114191 + 0.000000)
harvestReward     : 0
harvestCompGot    : 0
---------
---------
CREAM APY         : 0.114191
underlyingBalance : 12553
underlyingFees    : 305261833
underlyingFull    : 305274386
sy provider APY   : 0.108931
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.108931 0.114191 0.300000
sy spot APY (supply + distri) : 0.114191 (0.114191 + 0.000000)
harvestReward     : 0
harvestCompGot    : 0
---------
    √ yield and price movements (119299ms)
    √ CREAM switch controller (9943ms)

  CreamProvider
    _depositProvider() / _withdrawProvider()
      √ system should be in expected state (1188ms)
      √ only smartYield can call _depositProvider/_withdrawProvider (1316ms)
      √ _depositProvider deposits to provider (2012ms)
    _takeUnderlying() / _sendUnderlying()
      √ system should be in expected state (1205ms)
      √ only smartYield can call _takeUnderlying/_sendUnderlying (1291ms)
      √ _takeUnderlying takes underlying & checks for allowance (1631ms)
      √ _sendUnderlying sends underlying (1463ms)
    transferFees()
      √ transfers fees to feesOwner (2820ms)
    claimRewardsTo()
      √ transfer rewards to rewardsColector (2061ms)
    setController()
      √ only controller or DAO can change controller (1106ms)

  COMPOUND flow tests
---------
compound APY    : 0.051902
underlyingBalance : 99700580059
underlyingFees    : 300000000
underlyingFull : 100000580059
sy provider APY : 0.076600
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.076600 0.077301 0.300000
sy spot APY (supply + distri) : 0.077301 (0.051902 + 0.025168)
harvestReward   : 1627
harvestCompGot   : 363961850113773
---------
gain      : 30550464
principal : 100000000000
issuedAt  : 1654370362999999999999999999
maturesAt : 1654629563000000000000000000
    √ yield and price movements (177320ms)
    √ switch controller (17542ms)

  CompoundController.harvest()
    √ happy path with full harvest (3217ms)
    √ happy path with partial harvest (4992ms)
    √ happy path with more harvest than available (3525ms)
    √ reverts if uniswap price/slippage is below/more than HARVEST_COST (1468ms)
    √ reverts if claimComp gives 0 (1473ms)

  junior bonds: buyJuniorBond()
    purchase junior bonds
      √ buyJuniorBond works if abond maturesAt is in the past (7066ms)
      √ barnbridge oz c01 example test (4980ms)
      √ liquidation works (7139ms)
      √ junior bond redeem (5819ms)
      √ redeemJuniorBond() can return less than sellToken() extreme conditions (5733ms)
      √ junior gets jbond (2571ms)
      √ when buying jBonds juniorBondsMaturities is properly sorted (6523ms)

  tokens: buyTokens()
    √ should deploy contracts correctly (1645ms)
    instant withdraw
      √ if there's debt, it is forfeit (2492ms)
      √ if there's debt, it is forfeit with multiple juniors (2740ms)
    buyTokens
      √ junior gets tokens (2462ms)
    price
      √ yield decreases after buyBond, price goes down (2432ms)
      √ yield increases after buyBond, price goes up (2544ms)
      √ price doesn't change before and after buyTokens (2323ms)
      √ price doesn't change before and after buyBond (3128ms)
      √ with no yield price stays the same (2438ms)


  76 passing (10m)

-------------------------------------------------|----------|----------|----------|----------|----------------|
File                                             |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-------------------------------------------------|----------|----------|----------|----------|----------------|
 contracts\                                      |    96.34 |    65.38 |    96.23 |    95.96 |                |
  Governed.sol                                   |      100 |      100 |      100 |      100 |                |
  IBond.sol                                      |      100 |      100 |      100 |      100 |                |
  IController.sol                                |      100 |       50 |      100 |      100 |                |
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
 contracts\external-interfaces\cream-finance\    |      100 |      100 |      100 |      100 |                |
  ICrCToken.sol                                  |      100 |      100 |      100 |      100 |                |
  ICrComptroller.sol                             |      100 |      100 |      100 |      100 |                |
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
 contracts\providers\                            |    97.94 |    74.49 |    97.94 |    97.74 |                |
  AaveController.sol                             |      100 |     87.5 |      100 |      100 |                |
  AaveProvider.sol                               |      100 |       75 |      100 |      100 |                |
  CompoundController.sol                         |      100 |       80 |      100 |      100 |                |
  CompoundProvider.sol                           |    87.72 |    59.09 |    88.89 |    86.89 |... 216,218,220 |
  CreamController.sol                            |      100 |       90 |      100 |      100 |                |
  CreamProvider.sol                              |      100 |    72.73 |      100 |      100 |                |
  IAaveCumulator.sol                             |      100 |      100 |      100 |      100 |                |
  ICompoundCumulator.sol                         |      100 |      100 |      100 |      100 |                |
  ICreamCumulator.sol                            |      100 |      100 |      100 |      100 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|
All files                                        |    97.36 |    72.55 |    97.63 |    97.13 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|

> Istanbul reports written to ./coverage/ and ./coverage.json

```

