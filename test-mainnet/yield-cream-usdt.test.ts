import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, toBN, forceNextTime, mineBlocks, e, deployCreamController, deployCreamProvider, deployBondModelV2Compounded, dailyRate2APYCompounding } from '@testhelp/index';

import { ERC20Factory } from '@typechain/ERC20Factory';
import { ICrCToken } from '@typechain/ICrCToken';
import { ICrCTokenFactory } from '@typechain/ICrCTokenFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundProvider } from '@typechain/CompoundProvider';
import { ERC20 } from '@typechain/ERC20';
import { YieldOracle } from '@typechain/YieldOracle';
import { AaveProvider } from '@typechain/AaveProvider';
import { CreamController } from '@typechain/CreamController';
import { CreamProvider } from '@typechain/CreamProvider';

const A_HOUR = 60 * 60;
const A_DAY = 24 * A_HOUR;

const seniorBondCONF = { name: 'BarnBridge crUSDT sBOND', symbol: 'bb_sBOND_crUSDT' };
const juniorBondCONF = { name: 'BarnBridge crUSDT jBOND', symbol: 'bb_jBOND_crUSDT' };
const juniorTokenCONF = { name: 'BarnBridge crUSDT', symbol: 'bb_crUSDT' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

// ethereum / cream

// block = 12399504
// USDT supply APY 11.39%

// barnbridge
const decimals = 6; // same as USDT

// externals ---

// aave
const crUSDT = '0x797AAB1ce7c01eB727ab980762bA88e7133d2157';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const USDTwhale = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};

const dumpState = (crToken: ICrCToken, controller: CreamController, smartYield: SmartYield, pool: CreamProvider, oracle: YieldOracle, granularity: number) => {
  return async () => {

    const [creamSupplyRatePerBlock, spotDailySupplyRate, spotDailyRate, maxRatePerDay, oracleRatePerDay, underlyingBalance, underlyingFees, providerRatePerDay] = await Promise.all([
      crToken.callStatic.supplyRatePerBlock(),
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
    console.log('CREAM APY         :', dailyRate2APYCompounding(creamSupplyRatePerBlock.mul(4).mul(60).mul(24)));
    console.log('underlyingBalance :', underlyingBalance.toString());
    console.log('underlyingFees    :', underlyingFees.toString());
    console.log('underlyingFull    :', underlyingBalance.add(underlyingFees).toString());

    console.log('sy provider APY :', dailyRate2APYCompounding(providerRatePerDay));
    console.log('min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) :', dailyRate2APYCompounding(oracleRatePerDay), dailyRate2APYCompounding(spotDailyRate), dailyRate2APYCompounding(maxRatePerDay));
    console.log('sy spot APY (supply) :', dailyRate2APYCompounding(spotDailyRate), `(${dailyRate2APYCompounding(spotDailySupplyRate)})`);

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

export const buyTokens = (smartYield: SmartYield, pool: CompoundProvider | AaveProvider | CreamProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyTokens(amountUnderlying, 1, BN.from('2529935466'))).wait();
  };
};

export const buyBond = (smartYield: SmartYield, pool: CompoundProvider | AaveProvider | CreamProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN, forDays: number): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await (await smartYield.connect(user).buyBond(amountUnderlying, 1, BN.from('2529935466'), forDays)).wait();
  };
};

 const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const whaleSign = await impersonate(deployerSign)(USDTwhale);

    const underlying = ERC20Factory.connect(USDT, deployerSign);
    const crToken = ICrCTokenFactory.connect(crUSDT, deployerSign);

    await underlying.connect(whaleSign).approve(crToken.address, BN.from(e18(e18(e18(1)))));

    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModelV2Compounded(deployerSign),
      deployCreamProvider(deployerSign, crUSDT),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployCreamController(deployerSign, pool.address, smartYield.address, bondModel.address, deployerSign.address),
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
      oracle, smartYield, crToken, bondModel, seniorBond, underlying, controller, pool,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      dumpState: dumpState(crToken, controller, smartYield, pool, oracle, oracleCONF.granularity),
    };
  };
};


describe('Cream yield expected USDT', async function () {

  it('test yield', async function () {

    const { whaleSign, oracle, currentBlock, moveTime, buyTokens, buyBond, dumpState, controller } = await bbFixtures(fixture());

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
