``` shell 
  abond value computations
    ✓ should deploy contracts correctly (2258ms)
    first and last bond
      ✓ for one bond, abond is the same (2122ms)
      ✓ for new bonds, abondPaid stays the same (3019ms)
      ✓ last bond, is abond (2195ms)
      ✓ for bonds redeemed, abondDebt stays the same (3442ms)

  buyBond() / redeemBond()
    ✓ should deploy contracts correctly (1324ms)
    ✓ MathUtils.compound / MathUtils.compound2 works (2039ms)
    buyBond()
      ✓ buyBond require forDays / minGain / allowance (5131ms)
      ✓ buyBond creates a correct bond token (2047ms)
      ✓ buyBond creates several correct bond tokens (2703ms)
    redeemBond()
      ✓ redeemBond require matured, unredeemed (1960ms)
      ✓ redeemBond gives correct amounts (2568ms)
      ✓ redeemBond gives amounts to owner (2127ms)

  BondModel bond rate computations
    bondModel.gain()
      ✓ expected values (220ms)

  CompoundProvider._depositProvider() / CompoundProvider._withdrawProvider()
    ✓ system should be in expected state (1116ms)
    ✓ only smartYield can call _depositProvider/_withdrawProvider (1240ms)
    ✓ _depositProvider deposits to provider (2119ms)

  CompoundProvider._takeUnderlying() / CompoundProvider._sendUnderlying()
    ✓ system should be in expected state (1071ms)
    ✓ only smartYield can call _takeUnderlying/_sendUnderlying (1103ms)
    ✓ _takeUnderlying takes underlying & checks for allowance (1369ms)
    ✓ _sendUnderlying sends underlying (1254ms)

  Controller
    ✓ should deploy contracts correctly (1471ms)
    testing Icontroller and Governed
      ✓ Icontroller (8542ms)
      ✓ Governed (1503ms)

  flow tests
---------
compound APY    : 0.064339
underlyingBalance : 99700714823
underlyingFees    : 300000000
underlyingFull : 100000714823
sy provider APY : 0.100683
min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) : 0.101000 0.100683 0.300000
sy spot APY (supply + distri) : 0.100683 (0.064339 + 0.035601)
harvestReward   : 11213
harvestCompGot   : 789590538316118
---------
gain      : 39359511
principal : 100000000000
issuedAt  : 1648061543999999999999999999
maturesAt : 1648320744000000000000000000

    ✓ yield and price movements (144824ms)
    ✓ switch controller (13580ms)

  CompoundController.harvest()
    ✓ happy path with full harvest (3181ms)
    ✓ happy path with partial harvest (4174ms)
    ✓ happy path with more harvest than available (2538ms)
    ✓ reverts if uniswap price/slippage is below/more than HARVEST_COST (1146ms)
    ✓ reverts if claimComp gives 0 (1114ms)

  junior bonds: buyJuniorBond()
    purchase junior bonds
      ✓ buyJuniorBond works if abond maturesAt is in the past (5751ms)
      ✓ barnbridge oz c01 example test (3355ms)
      ✓ liquidation works (5454ms)
      ✓ junior bond redeem (4063ms)
      ✓ redeemJuniorBond() can return less than sellToken() extreme conditions (4484ms)
      ✓ junior gets jbond (2015ms)
      ✓ when buying jBonds juniorBondsMaturities is properly sorted (5066ms)

  tokens: buyTokens()
    ✓ should deploy contracts correctly (1415ms)
    instant withdraw
      ✓ if there's debt, it is forfeit (2107ms)
      ✓ if there's debt, it is forfeit with multiple juniors (2274ms)
    buyTokens
      ✓ junior gets tokens (1627ms)
    price
      ✓ yield decreases after buyBond, price goes down (1983ms)
      ✓ yield increases after buyBond, price goes up (2109ms)
      ✓ price doesn't change before and after buyTokens (1920ms)
      ✓ price doesn't change before and after buyBond (1811ms)
      ✓ with no yield price stays the same (2044ms)


  47 passing (5m)

-------------------------------------------------|----------|----------|----------|----------|----------------|
File                                             |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-------------------------------------------------|----------|----------|----------|----------|----------------|
 contracts/                                      |    95.29 |     64.1 |    94.34 |    94.95 |                |
  Governed.sol                                   |      100 |      100 |      100 |      100 |                |
  IBond.sol                                      |      100 |      100 |      100 |      100 |                |
  IController.sol                                |    84.62 |        0 |       90 |    84.62 |          48,52 |
  IProvider.sol                                  |      100 |      100 |      100 |      100 |                |
  ISmartYield.sol                                |      100 |      100 |      100 |      100 |                |
  JuniorBond.sol                                 |      100 |       50 |      100 |      100 |                |
  JuniorToken.sol                                |      100 |      100 |      100 |      100 |                |
  SeniorBond.sol                                 |      100 |       50 |      100 |      100 |                |
  SmartYield.sol                                 |    95.65 |    65.63 |    93.55 |    95.18 |... 580,581,691 |
 contracts/external-interfaces/compound-finance/ |      100 |      100 |      100 |      100 |                |
  ICToken.sol                                    |      100 |      100 |      100 |      100 |                |
  IComptroller.sol                               |      100 |      100 |      100 |      100 |                |
  IUniswapAnchoredOracle.sol                     |      100 |      100 |      100 |      100 |                |
 contracts/external-interfaces/uniswap/          |      100 |      100 |      100 |      100 |                |
  IUniswapV2Router.sol                           |      100 |      100 |      100 |      100 |                |
 contracts/lib/math/                             |    88.89 |    66.67 |      100 |    88.89 |                |
  MathUtils.sol                                  |    88.89 |    66.67 |      100 |    88.89 |          28,46 |
 contracts/lib/uniswap/                          |    11.71 |     7.63 |    25.93 |    12.12 |                |
  Babylonian.sol                                 |        0 |        0 |        0 |        0 |... 48,49,50,51 |
  BitMath.sol                                    |        0 |        0 |        0 |        0 |... 78,79,81,83 |
  FixedPoint.sol                                 |    19.23 |    13.89 |    27.27 |    19.61 |... 142,143,144 |
  FullMath.sol                                   |        0 |        0 |        0 |        0 |... 44,46,48,49 |
  UniswapV2Library.sol                           |    14.71 |       10 |       25 |    14.71 |... 76,77,78,79 |
  UniswapV2OracleLibrary.sol                     |      100 |      100 |      100 |      100 |                |
 contracts/mocks/                                |       60 |      100 |       75 |       60 |                |
  Erc20Mock.sol                                  |       60 |      100 |       75 |       60 |          16,17 |
 contracts/mocks/barnbridge/                     |    64.71 |       50 |    64.29 |    61.11 |                |
  CompoundControllerMock.sol                     |    88.89 |       50 |      100 |    88.89 |             47 |
  MathTests.sol                                  |      100 |      100 |      100 |      100 |                |
  SmartYieldMock.sol                             |      100 |      100 |      100 |      100 |                |
  YieldOracleMock.sol                            |        0 |      100 |        0 |        0 |... 26,30,34,35 |
 contracts/mocks/barnbridge/harvest/             |    96.15 |       50 |    93.75 |    96.15 |                |
  CompoundControllerHarvestMock.sol              |      100 |      100 |      100 |      100 |                |
  HarvestWorldMock.sol                           |    95.45 |       50 |    92.31 |    95.45 |             34 |
 contracts/mocks/compound-finance/               |    84.78 |      100 |    66.67 |    85.42 |                |
  CTokenWorldMock.sol                            |    83.33 |      100 |     61.9 |    84.09 |... 115,133,145 |
  CompOracleMock.sol                             |      100 |      100 |      100 |      100 |                |
 contracts/mocks/uniswap/                        |      100 |       50 |      100 |      100 |                |
  UniswapMock.sol                                |      100 |       50 |      100 |      100 |                |
 contracts/model/                                |       75 |       50 |      100 |       75 |                |
  BondModelV1.sol                                |       75 |       50 |      100 |       75 |          24,48 |
  IBondModel.sol                                 |      100 |      100 |      100 |      100 |                |
 contracts/oracle/                               |    96.43 |       70 |      100 |    96.43 |                |
  IYieldOracle.sol                               |      100 |      100 |      100 |      100 |                |
  IYieldOraclelizable.sol                        |      100 |      100 |      100 |      100 |                |
  YieldOracle.sol                                |    96.43 |       70 |      100 |    96.43 |            142 |
 contracts/providers/                            |    95.93 |    71.43 |    94.87 |    95.48 |                |
  CompoundController.sol                         |      100 |       80 |      100 |      100 |                |
  CompoundProvider.sol                           |    87.72 |    63.64 |    88.89 |    86.89 |... 216,218,220 |
  ICompoundCumulator.sol                         |      100 |      100 |      100 |      100 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|
All files                                        |    70.42 |     41.1 |    79.27 |    71.31 |                |
-------------------------------------------------|----------|----------|----------|----------|----------------|
``` 
