import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e18j, e6, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, deployBondModel, toBN, forceNextTime, mineBlocks, dailyRate2APYCompounding, e, deployIdleController, deployIdleProvider, dailyRate2APYLinear, deployBondModelV2Linear, sellTokens } from '@testhelp/index';

import { ERC20Factory } from '@typechain/ERC20Factory';
import { IIdleToken } from '@typechain/IIdleToken';
import { IIdleTokenFactory } from '@typechain/IIdleTokenFactory';
import { SmartYield } from '@typechain/SmartYield';
import { ERC20 } from '@typechain/ERC20';
import { YieldOracle } from '@typechain/YieldOracle';
import { IdleController } from '@typechain/IdleController';
import { IdleProvider } from '@typechain/IdleProvider';

const A_HOUR = 60 * 60;
const A_DAY = 24 * A_HOUR;

const seniorBondCONF = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
const juniorBondCONF = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
const juniorTokenCONF = { name: 'BarnBridge cDAI', symbol: 'bb_cDAI' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

// ethereum / idle

// block = 12269908
// DAI supply APY 5.63%

// barnbridge
const decimals = 18; // same as DAI

// externals ---

// idle

const idleDAI = "0x3fe7940616e5bc47b0775a0dccf6237893353bb4";
const IDLE_GOV_TOKEN = "0x875773784Af8135eA0ef43b5a374AaD105c5D39e";
const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAIWHALE = '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503';

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};

const dumpState = (idleToken: IIdleToken, controller: IdleController, smartYield: SmartYield, pool: IdleProvider, oracle: YieldOracle, granularity: number) => {
  return async () => {

    const [spotDailySupplyRate, spotDailyRate, maxRatePerDay, oracleRatePerDay, underlyingBalance, underlyingFees, providerRatePerDay] = await Promise.all([
      controller.callStatic.spotDailySupplyRateProvider(),
      controller.callStatic.spotDailyRate(),
      controller.callStatic.BOND_MAX_RATE_PER_DAY(),
      oracle.callStatic.consult(A_DAY),

      pool.callStatic.underlyingBalance(),
      pool.callStatic.underlyingFees(),
      controller.callStatic.providerRatePerDay(),
      smartYield.callStatic.maxBondDailyRate(),
    ]);

    console.log('---------');
    //console.log('compound APY      :', dailyRate2APY(compoundSupplyRate.mul(4).mul(60).mul(24)));
    console.log('underlyingBalance :', underlyingBalance.toString());
    console.log('underlyingFees    :', underlyingFees.toString());
    console.log('underlyingFull    :', underlyingBalance.add(underlyingFees).toString());

    console.log('sy provider APY :', dailyRate2APYLinear(providerRatePerDay));
    console.log('min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) :', dailyRate2APYLinear(oracleRatePerDay), dailyRate2APYLinear(spotDailyRate), dailyRate2APYLinear(maxRatePerDay));
    console.log('sy spot APY (supply) :', dailyRate2APYLinear(spotDailyRate), `(${dailyRate2APYLinear(spotDailySupplyRate)})`);

    console.log('---------');
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

export const buyTokens = (smartYield: SmartYield, pool: IdleProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyTokens(amountUnderlying, 1, BN.from('2529935466'))).wait();
  };
};

export const buyBond = (smartYield: SmartYield, pool: IdleProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN, forDays: number): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyBond(amountUnderlying, 1, BN.from('2529935466'), forDays)).wait();
  };
};

 const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const whaleSign = await impersonate(deployerSign)(DAIWHALE);

    const underlying = ERC20Factory.connect(DAI, deployerSign);
    const idleToken = IIdleTokenFactory.connect(idleDAI, deployerSign);

    await underlying.connect(whaleSign).approve(idleToken.address, BN.from(e18(e18(e18(1)))));

    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModelV2Linear(deployerSign),
      deployIdleProvider(deployerSign, idleDAI),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployIdleController(deployerSign, pool.address, smartYield.address, bondModel.address, deployerSign.address),
      deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol),
      deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol),
    ]);

    const [oracle ] = await Promise.all([
      deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity),
      controller.setBondModel(bondModel.address),
      controller.setFeesOwner(deployerSign.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      pool.setup(smartYield.address, controller.address),
    ]);

    await controller.setOracle(oracle.address);


    return {
      oracle, smartYield, idleToken, bondModel, seniorBond, underlying, controller, pool,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      dumpState: dumpState(idleToken, controller, smartYield, pool, oracle, oracleCONF.granularity),
    };
  };
};


describe('yield expected DAI', async function () {

  it('test yield', async function () {

    const { whaleSign, pool, idleToken, oracle, currentBlock, moveTime, buyTokens, buyBond, dumpState, controller } = await bbFixtures(fixture());

    await buyTokens(whaleSign as unknown as Wallet, e(1_000, decimals));

    let skipBlocks = 0;

    for (let i = 0; i < 100; i++) {
      await mineBlocks(BLOCKS_A_PERIOD / 5 - skipBlocks);
      skipBlocks = 0;

      //await (await cToken.connect(whaleSign).accrueInterest()).wait();

      if (i % 5 == 4) {
        skipBlocks++;
        await forceNextTime();
        console.log('+++ UPDATE!');
        await oracle.update();
        console.log('--- UPDATE!');
      }


      if (i % 20 == 1) {
        skipBlocks++;
        await forceNextTime();
        await buyTokens(whaleSign as unknown as Wallet, e(1_000, decimals));
      }

      if (i % 20 == 19) {
        skipBlocks++;
        await forceNextTime();
        await buyBond(whaleSign as unknown as Wallet, e(1_000, decimals), 30);
      }

      //await mineBlocks(1);

      console.log(`[${i}]`);
      skipBlocks++;
      await forceNextTime();
      await dumpState();
    }

  }).timeout(500 * 1000);

});
