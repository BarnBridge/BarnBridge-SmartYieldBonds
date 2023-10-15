import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN, Contract } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e18j, e6, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, toBN, forceNextTime, mineBlocks, dumpSeniorBond, sellTokens, TIME_IN_FUTURE, redeemBond, redeemJuniorBond, dailyRate2APYCompounding, deployIdleProvider, deployIdleController, deployBondModelV2Compounded } from '@testhelp/index';

import { ERC20Factory } from '@typechain/ERC20Factory';
import { SmartYield } from '@typechain/SmartYield';
import { ERC20 } from '@typechain/ERC20';
import { YieldOracle } from '@typechain/YieldOracle';
import { IIdleTokenFactory } from '@typechain/IIdleTokenFactory';
import { IERC20Factory } from '@typechain/IERC20Factory';
import { IIdleToken } from '@typechain/IIdleToken';
import { IdleProvider } from '@typechain/IdleProvider';
import { IdleController } from '@typechain/IdleController';

const A_HOUR = 60 * 60;
const A_DAY = 24 * A_HOUR;

const seniorBondCONF = { name: 'BarnBridge idleDAI sBOND', symbol: 'bbsidleDAI' };
const juniorBondCONF = { name: 'BarnBridge idleDAI jBOND', symbol: 'bbjidleDAI' };
const juniorTokenCONF = { name: 'BarnBridge idleDAI', symbol: 'bbidleDAI' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

// barnbridge
const decimals = 18; // same as DAI

// externals ---

// Idle
const idleDAI = "0x3fe7940616e5bc47b0775a0dccf6237893353bb4";
const IDLE_GOV_TOKEN = "0x875773784Af8135eA0ef43b5a374AaD105c5D39e";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAIWHALE = '0xf977814e90da44bfa03b6295a0616a897441acec';

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};

//TODO
const dumpState = (idleToken: IIdleToken, controller: IdleController, smartYield: SmartYield, pool: IdleProvider, oracle: YieldOracle, granularity: number, underlying: ERC20) => {
  return async () => {

    const [idleApr, spotDailySupplyRate, spotDailyDistributionRate, spotDailyRate, maxRatePerDay, oracleRatePerDay, underlyingBalance, underlyingFees, providerRatePerDay, maxBondDailyRate, exchangeRateCurrent, cTokenBalance] = await Promise.all([
      idleToken.callStatic.getAvgAPR(),
      controller.callStatic.spotDailySupplyRateProvider(),
      controller.callStatic.spotDailyDistributionRateProvider(),
      controller.callStatic.spotDailyRate(),
      controller.callStatic.BOND_MAX_RATE_PER_DAY(),
      oracle.callStatic.consult(A_DAY),

      pool.callStatic.underlyingBalance(),
      pool.callStatic.underlyingFees(),
      controller.callStatic.providerRatePerDay(),

      smartYield.callStatic.maxBondDailyRate(),
      pool.callStatic.exchangeRateCurrent(),
      pool.callStatic.cTokenBalance(),
    ]);

    // let { rewardAmountGot, underlyingHarvestReward } = { rewardAmountGot: BN.from(0), underlyingHarvestReward: BN.from(0) };
    //
    // try {
    //   ({ rewardAmountGot, underlyingHarvestReward } = await controller.callStatic.harvest(0));
    // } catch(e) {
    //   console.log('harvest error');
    // }

    let { tokens, rewardAmounts, underlyingHarvestReward } = { tokens: ['0x'], rewardAmounts: [BN.from(0)], underlyingHarvestReward: BN.from(0) };

    try {
      ({ tokens, rewardAmounts, underlyingHarvestReward } = await controller.callStatic.harvest(0));
    } catch(e) {
      console.log('harvest error');
    }

    console.log('---------');
    console.log(Number(idleApr));
    console.log('Idle APY         :', dailyRate2APYCompounding(idleApr.div(36525)));
    console.log('underlyingBalance :', underlyingBalance.toString());
    console.log('underlyingFees    :', underlyingFees.toString());
    console.log('underlyingFull    :', underlyingBalance.add(underlyingFees).toString());
    console.log('pool exchangeratecurrent: ', exchangeRateCurrent.toString());
    console.log('cTokenBalance: ', cTokenBalance.toString());
    console.log('sy provider APY   :', dailyRate2APYCompounding(providerRatePerDay));
    console.log('min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) :', dailyRate2APYCompounding(oracleRatePerDay), dailyRate2APYCompounding(spotDailyRate), dailyRate2APYCompounding(maxRatePerDay));
    console.log('sy spot APY (supply + distri) :', dailyRate2APYCompounding(spotDailyRate), `(${dailyRate2APYCompounding(spotDailySupplyRate)} + ${dailyRate2APYCompounding(spotDailyDistributionRate)})`);

    console.log('harvestReward     :', underlyingHarvestReward.toString());
    for (let i = 0; i < tokens.length; i++) {
        console.log('token    :', tokens[i].toString(), 'harvestRewardGot    :', rewardAmounts[i].toString());
    }
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

const moveTime = (whale: Wallet) => {
  return async (seconds: number | BN | BNj): Promise<void> => {
    seconds = BN.from(seconds.toString());
    await ethers.provider.send('evm_increaseTime', [seconds.toNumber()]);
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

export const buyTokens = (smartYield: SmartYield, pool: Contract, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyTokens(amountUnderlying, 1, BN.from('2529935466'))).wait();
  };
};

export const buyBond = (smartYield: SmartYield, pool: Contract, underlying: ERC20) => {
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

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, rewardsCollector, junior1, junior2, junior3, senior1, senior2, senior3, user1] = wallets;
    //const whaleSign = await impersonate(deployerSign)(USDTwhale);
    const whaleSign = await impersonate(deployerSign)(DAIWHALE);
    const underlying = ERC20Factory.connect(DAI, deployerSign);
    //const idleToken = ICrCTokenFactory.connect(crUSDT, deployerSign);
    const idleToken = IIdleTokenFactory.connect(idleDAI, deployerSign);
    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModelV2Compounded(deployerSign),
      deployIdleProvider(deployerSign, idleDAI),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);
    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployIdleController(deployerSign, pool.address, smartYield.address, bondModel.address, deployerSign.address),
      deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol),
      deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol),
    ]);
    const [oracle] = await Promise.all([
      deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity),
      controller.setFeesOwner(deployerSign.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      pool.setup(smartYield.address, controller.address),
    ]);

    await controller.setOracle(oracle.address);

    return {
      oracle, smartYield, idleToken, bondModel, seniorBond, underlying, controller, pool,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      rewardsCollector: rewardsCollector as Signer,
      user1,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyJuniorBond: buyJuniorBond(smartYield),
      sellTokens: sellTokens(smartYield, pool),
      redeemJuniorBond: redeemJuniorBond(smartYield),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      dumpState: dumpState(idleToken, controller, smartYield, pool, oracle, oracleCONF.granularity, underlying),
      moveTimeWindowAndUpdate: moveTimeWindowAndUpdate(oracle),
    };
  };
};

describe('Idle flow tests', async function () {

  it('yield and price movements', async function () {
    const { whaleSign, idleToken, deployerSign, rewardsCollector, buyTokens, buyBond, sellTokens, redeemBond, redeemJuniorBond, dumpState, controller, moveTimeWindowAndUpdate, buyJuniorBond, smartYield } = await bbFixtures(fixture());
    const priceInitial = await smartYield.callStatic.price();
    expect(priceInitial, 'initial price is 1').deep.equal(e18(1));
    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10 ** 6);
    const gotJtokens1 = await smartYield.callStatic.balanceOf(await whaleSign.getAddress());

    await moveTimeWindowAndUpdate();
    await dumpState();

    const providerRatePerDayInitial = await controller.callStatic.providerRatePerDay();
    expect(providerRatePerDayInitial.gt(0), 'provider rate per day increases').equal(true);

    const priceAfterJtokens = await smartYield.callStatic.price();
    expect(priceAfterJtokens.gt(priceInitial), 'initially price increases').equal(true);

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10 ** 6, 3);

    const bond1 = await smartYield.seniorBonds(1);
    const abond1 = await smartYield.abond();
    dumpSeniorBond(abond1);

    expect(bond1.gain.gt(0), 'bond1 gain > 0').equal(true);
    expect(bond1.gain, 'bond1 gain is abond gain').deep.equal(abond1.gain);

    await moveTimeWindowAndUpdate();

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10 ** 6, 1);
    const bond2 = await smartYield.seniorBonds(2);

    await moveTimeWindowAndUpdate();

    const priceAfter2Bonds = await smartYield.callStatic.price();
    expect(priceAfter2Bonds.gt(priceAfterJtokens), 'price increases after 2 bonds').equal(true);

    await sellTokens(whaleSign as unknown as Wallet, 50_000 * 10 ** 6);

    await buyJuniorBond(whaleSign as unknown as Wallet, gotJtokens1.sub(50_000 * 10 ** 6), TIME_IN_FUTURE);

    for (let f = 0; f < 24 * 3; f++) {
      await moveTimeWindowAndUpdate();
    }

    const priceAfter3Days = await smartYield.callStatic.price();
    expect(priceAfter3Days.gt(priceAfter2Bonds), 'price increases further after 2 bonds & 3 days').equal(true);

    await redeemBond(whaleSign as unknown as Wallet, 1);
    await redeemBond(whaleSign as unknown as Wallet, 2);

    await redeemJuniorBond(whaleSign as unknown as Wallet, 1);

    await dumpState();

    const priceAfterWithdrawls = await smartYield.callStatic.price();
    expect(priceAfterWithdrawls, 'price after withdrawls is 1').deep.equal(e18(1));

    // const incentivesController = IStakedTokenIncentivesControllerFactory.connect(await aToken.getIncentivesController(), deployerSign);
    // const rewardToken = IERC20Factory.connect(await incentivesController.REWARD_TOKEN(), deployerSign);

    // expect(await rewardToken.balanceOf(await rewardsCollector.getAddress()), 'initial reward collector balance is 0').deep.equal(BN.from(0));

    // await controller.harvest(0);

    // expect((await rewardToken.balanceOf(await rewardsCollector.getAddress())).gt(0), 'initial reward collector balance gt 0').equal(true);

    await dumpState();

  }).timeout(500 * 1000);

  it('Idle switch controller', async function () {
    const { whaleSign, pool, oracle, buyTokens, buyBond, controller, smartYield, deployerSign, user1 } = await bbFixtures(fixture());

    await controller.setGuardian(user1.address);
    await controller.setDao(user1.address);

    const newBondModel = await deployBondModelV2Compounded(deployerSign as unknown as Wallet);
    const newController = await deployIdleController(deployerSign as unknown as Wallet, pool.address, smartYield.address, newBondModel.address, await deployerSign.getAddress());
    const newOracle = await deployYieldOracle(deployerSign as unknown as Wallet, newController.address, oracleCONF.windowSize, oracleCONF.granularity);
    await newController.setOracle(newOracle.address);

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10 ** 6);

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

    await buyBond(whaleSign as unknown as Wallet, 100_000 * 10 ** 6, 1);
  }).timeout(500 * 1000);

});
