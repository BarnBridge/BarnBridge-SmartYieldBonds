import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e18j, e6, deployCompoundController, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, deployBondModel, deployCompoundProvider, toBN, forceNextTime, mineBlocks, dailyRate2APY, dumpSeniorBond, sellTokens, withDecimals, deployUnderlying, TIME_IN_FUTURE, redeemBond, redeemJuniorBond } from '@testhelp/index';

import { ERC20Factory } from '@typechain/ERC20Factory';
import { ICTokenFactory } from '@typechain/ICTokenFactory';
import { ICToken } from '@typechain/ICToken';
import { IComptrollerFactory } from '@typechain/IComptrollerFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundProvider } from '@typechain/CompoundProvider';
import { ERC20 } from '@typechain/ERC20';
import { YieldOracle } from '@typechain/YieldOracle';
import { CompoundController } from '@typechain/CompoundController';

const A_HOUR = 60 * 60;
const A_DAY = 24 * A_HOUR;

const seniorBondCONF = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
const juniorBondCONF = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
const juniorTokenCONF = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;


// barnbridge
const decimals = 6; // same as USDC

// externals ---

// compound
const cUSDC = '0x39AA39c021dfbaE8faC545936693aC917d5E7563';
const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';
const cComptroller = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

// uniswap https://uniswap.org/docs/v2/smart-contracts/router02/
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapPath = [COMP, WETH, USDC];

const USDCwhale = '0x55FE002aefF02F77364de339a1292923A15844B8';

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};


const dumpState = (cToken: ICToken, controller: CompoundController, smartYield: SmartYield, pool: CompoundProvider, oracle: YieldOracle, granularity: number) => {
  return async () => {

    const [spotDailySupplyRate, spotDailyDistributionRate, spotDailyRate, maxRatePerDay, oracleRatePerDay, underlyingBalance, underlyingFees, compoundSupplyRate, providerRatePerDay, maxBondDailyRate] = await Promise.all([
      controller.callStatic.spotDailySupplyRateProvider(),
      controller.callStatic.spotDailyDistributionRateProvider(),
      controller.callStatic.spotDailyRate(),
      controller.callStatic.BOND_MAX_RATE_PER_DAY(),
      oracle.callStatic.consult(A_DAY),

      pool.callStatic.underlyingBalance(),
      pool.callStatic.underlyingFees(),
      cToken.callStatic.supplyRatePerBlock(),
      controller.callStatic.providerRatePerDay(),

      smartYield.callStatic.maxBondDailyRate(),
    ]);

    const {compGot, underlyingHarvestReward} = await controller.callStatic.harvest(0);

    console.log('---------');
    console.log('compound APY    :', dailyRate2APY(compoundSupplyRate.mul(4).mul(60).mul(24)));
    console.log('underlyingBalance :', underlyingBalance.toString());
    console.log('underlyingFees    :', underlyingFees.toString());
    console.log('underlyingFull :', underlyingBalance.add(underlyingFees).toString());

    console.log('sy provider APY :', dailyRate2APY(providerRatePerDay));
    console.log('min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) :', dailyRate2APY(oracleRatePerDay), dailyRate2APY(spotDailyRate), dailyRate2APY(maxRatePerDay));
    console.log('sy spot APY (supply + distri) :', dailyRate2APY(spotDailyRate), `(${dailyRate2APY(spotDailySupplyRate)} + ${dailyRate2APY(spotDailyDistributionRate)})`);

    console.log('harvestReward   :', underlyingHarvestReward.toString());
    console.log('harvestCompGot   :', compGot.toString());
    console.log('---------');
  };
};

const moveTimeWindowAndUpdate = (oracle: YieldOracle) => {
  return async (): Promise<void> => {
    for (let f = 0; f < oracleCONF.granularity; f++) {
      await mineBlocks(BLOCKS_A_PERIOD - 1);
      await forceNextTime();
      await oracle.update();
    }
    await forceNextTime();
  };
};

const moveTime = (cToken: ICToken, whale: Wallet) => {
  return async (seconds: number | BN | BNj): Promise<void> => {
    seconds = BN.from(seconds.toString());
    await ethers.provider.send('evm_increaseTime', [seconds.toNumber()]);
    await cToken.connect(whale).mint(BN.from(1));
  };
};

const currentBlock = () => {
  return async () => {
    return await ethers.provider.getBlock('latest');
  };
};

const impersonate = (ethWallet: Signer) => {
  return async (addr: string) => {
    await ethWallet.sendTransaction({
      to: addr,
      value: e18(1),
    });
    await ethers.provider.send('hardhat_impersonateAccount', [addr]);
    return await ethers.provider.getSigner(addr);
  };
};

export const buyTokens = (smartYield: SmartYield, pool: CompoundProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyTokens(amountUnderlying, 1, BN.from('2529935466'))).wait();
  };
};

export const buyBond = (smartYield: SmartYield, pool: CompoundProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN, forDays: number): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyBond(amountUnderlying, 1, BN.from('2529935466'), forDays)).wait();
  };
};

export const buyJuniorBond = (smartYield: SmartYield) => {
  return async (user: Wallet, tokenAmount: number | BN, maxMaturesAt: number | BN): Promise<void> => {
    tokenAmount = toBN(tokenAmount);
    maxMaturesAt = toBN(maxMaturesAt);
    await smartYield.connect(user).buyJuniorBond(tokenAmount, maxMaturesAt, TIME_IN_FUTURE);
  };
};

export const mintCtoken = (cToken: ICToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).mint(underlyingAmount_);
  };
};

export const redeemCtoken = (cToken: ICToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).redeemUnderlying(underlyingAmount_);
  };
};

 const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3, user1] = wallets;

    const whaleSign = await impersonate(deployerSign)(USDCwhale);

    const underlying = ERC20Factory.connect(USDC, deployerSign);
    const cToken = ICTokenFactory.connect(cUSDC, deployerSign);
    const comp = ERC20Factory.connect(COMP, deployerSign);
    const compoundComptroller = IComptrollerFactory.connect(cComptroller, deployerSign);

    await underlying.connect(whaleSign).approve(cToken.address, BN.from(e18(e18(e18(1)))));

    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployCompoundProvider(deployerSign, cUSDC),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployCompoundController(deployerSign, pool.address, smartYield.address, bondModel.address, uniswapPath),
      deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol),
      deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol),
    ]);

    const [oracle ] = await Promise.all([
      deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity),
      controller.setFeesOwner(deployerSign.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      pool.setup(smartYield.address, controller.address),
    ]);

    await controller.setOracle(oracle.address);

    return {
      oracle, smartYield, cToken, bondModel, seniorBond, underlying, controller, pool, compoundComptroller, comp,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      user1,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(cToken, whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyJuniorBond: buyJuniorBond(smartYield),
      sellTokens: sellTokens(smartYield, pool),
      redeemJuniorBond: redeemJuniorBond(smartYield),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      mintCtoken: mintCtoken(cToken, whaleSign as unknown as Wallet),
      redeemCtoken: redeemCtoken(cToken, whaleSign as unknown as Wallet),
      dumpState: dumpState(cToken, controller, smartYield, pool, oracle, oracleCONF.granularity),
      moveTimeWindowAndUpdate: moveTimeWindowAndUpdate(oracle),
    };
  };
};


describe('flow tests', async function () {

  it('yield and price movements', async function () {

    const { whaleSign, pool, cToken, comp, oracle, currentBlock, moveTime, buyTokens, buyBond, sellTokens, mintCtoken, redeemCtoken, redeemBond, redeemJuniorBond, dumpState, controller, moveTimeWindowAndUpdate, buyJuniorBond, smartYield, underlying } = await bbFixtures(fixture());

    const priceInitial = await smartYield.callStatic.price();

    expect(priceInitial, 'initial price is 1').deep.equal(e18(1));

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    const gotJtokens1 = await smartYield.callStatic.balanceOf(await whaleSign.getAddress());

    await moveTimeWindowAndUpdate();
    await dumpState();

    const providerRatePerDayInitial = await controller.callStatic.providerRatePerDay();
    expect(providerRatePerDayInitial.gt(0), 'provider rate per day increases').equal(true);

    const priceAfterJtokens = await smartYield.callStatic.price();
    expect(priceAfterJtokens.gt(priceInitial), 'initially price increases').equal(true);

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10**6, 3);

    const bond1 = await smartYield.seniorBonds(1);
    const abond1 = await smartYield.abond();
    dumpSeniorBond(abond1);

    expect(bond1.gain, 'bond1 gain').deep.equal(BN.from('39358600'));
    expect(bond1.gain, 'bond1 gain is abond gain').deep.equal(abond1.gain);

    await moveTimeWindowAndUpdate();

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10**6, 1);
    const bond2 = await smartYield.seniorBonds(2);

    await moveTimeWindowAndUpdate();

    const providerRatePerDayAfter2Bonds = await controller.callStatic.providerRatePerDay();
    expect(providerRatePerDayAfter2Bonds.lt(providerRatePerDayInitial), 'provider rate per day decreases after 2 bonds').equal(true);

    const priceAfter2Bonds = await smartYield.callStatic.price();
    expect(priceAfter2Bonds.gt(priceAfterJtokens), 'price increases after 2 bonds').equal(true);

    await sellTokens(whaleSign as unknown as Wallet, 50_000 * 10**6);

    await buyJuniorBond(whaleSign as unknown as Wallet, gotJtokens1.sub(50_000 * 10**6), TIME_IN_FUTURE);

    for (let f = 0; f < 24 * 3; f++) {
      await moveTimeWindowAndUpdate();
    }

    const priceAfter3Days = await smartYield.callStatic.price();
    expect(priceAfter3Days.gt(priceAfter2Bonds), 'price increases further after 2 bonds & 3 days').equal(true);

    await redeemBond(whaleSign as unknown as Wallet, 1);
    await redeemBond(whaleSign as unknown as Wallet, 2);

    await redeemJuniorBond(whaleSign as unknown as Wallet, 1);

    const priceAfterWithdrawls = await smartYield.callStatic.price();
    expect(priceAfterWithdrawls, 'price after withdrawls is 1').deep.equal(e18(1));

  }).timeout(500 * 1000);

  it('switch controller', async function () {
    const { whaleSign, pool, cToken, comp, oracle, currentBlock, moveTime, buyTokens, buyBond, sellTokens, mintCtoken, redeemCtoken, redeemBond, redeemJuniorBond, dumpState, controller, moveTimeWindowAndUpdate, buyJuniorBond, smartYield, underlying, deployerSign, user1 } = await bbFixtures(fixture());

    await controller.setGuardian(user1.address);
    await controller.setDao(user1.address);

    const newBondModel = await deployBondModel(deployerSign as unknown as Wallet);
    const newController = await deployCompoundController(deployerSign as unknown as Wallet, pool.address, smartYield.address, newBondModel.address, uniswapPath);
    const newOracle = await deployYieldOracle(deployerSign as unknown as Wallet, newController.address, oracleCONF.windowSize, oracleCONF.granularity);
    await newController.setOracle(newOracle.address);

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    const newControllerProviderRatePerDay = await newController.callStatic.providerRatePerDay();
    expect(newControllerProviderRatePerDay.eq(0), 'newController provider rate per day is 0 initially').equal(true);

    const controllerProviderRatePerDay = await controller.callStatic.providerRatePerDay();
    expect(controllerProviderRatePerDay.eq(0), 'controller provider rate per day is 0 initially').equal(true);

    for (let f = 0; f < oracleCONF.granularity; f++) {
      await mineBlocks(BLOCKS_A_PERIOD - 2);
      await forceNextTime();
      await newOracle.update();
      await forceNextTime();
      await oracle.update();
    }

    const controllerProviderRatePerDayInitial = await controller.callStatic.providerRatePerDay();
    expect(controllerProviderRatePerDayInitial.gt(0), 'controller provider rate per day increases').equal(true);

    const newControllerProviderRatePerDayInitial = await newController.callStatic.providerRatePerDay();
    expect(newControllerProviderRatePerDayInitial.gt(0), 'newController provider rate per day increases').equal(true);

    await expect(controller.yieldControllTo(newController.address), 'reverted if not dao').revertedWith('GOV: not dao');

    await controller.connect(user1).yieldControllTo(newController.address);

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10**6, 1);
  }).timeout(500 * 1000);


});
