import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e18j, e6, deployCompoundController, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, deployBondModel, deployCompoundProvider, toBN, forceNextTime, mineBlocks, dailyRate2APYCompounding, e } from '@testhelp/index';

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

const seniorBondCONF = { name: 'BarnBridge cWBTC sBOND', symbol: 'bb_sBOND_cWBTC' };
const juniorBondCONF = { name: 'BarnBridge cWBTC jBOND', symbol: 'bb_jBOND_cWBTC' };
const juniorTokenCONF = { name: 'BarnBridge cWBTC', symbol: 'bb_cWBTC' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

// ethereum / compound

// block = 12154444
// USDC supply APY 8.29%
// USDC distribution APY 2.55% (2.448%)
// 1 COMP ~= 448 USD (comp oracle)
// 1 COMP ~= 449 USDC (uniswap)

// barnbridge
const decimals = 8; // same as WBTC

// externals ---

// compound
const cWBTC = '0xccF4429DB6322D5C611ee964527D42E5d685DD6a';
const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';
const cComptroller = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

// uniswap https://uniswap.org/docs/v2/smart-contracts/router02/
const WBTC = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapPath = [COMP, WETH, WBTC];

const WBTCwhale = '0x3Fea27346894f5bDF53aC4AcB599fcfEc36a4883';

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};

const dumpState = (cToken: ICToken, controller: CompoundController, smartYield: SmartYield, pool: CompoundProvider, oracle: YieldOracle, granularity: number) => {
  return async () => {

    const [spotCompToUnderlying, spotDailySupplyRate, spotDailyDistributionRate, spotDailyRate, maxRatePerDay, oracleRatePerDay, underlyingBalance, underlyingFees, compoundSupplyRate, providerRatePerDay, maxBondDailyRate] = await Promise.all([
      controller.callStatic.quoteSpotCompToUnderlying(e18(1)),
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

    console.log('---------');
    console.log('compound APY      :', dailyRate2APYCompounding(compoundSupplyRate.mul(4).mul(60).mul(24)));
    console.log('underlyingBalance :', underlyingBalance.toString());
    console.log('underlyingFees    :', underlyingFees.toString());
    console.log('underlyingFull    :', underlyingBalance.add(underlyingFees).toString());

    console.log('sy provider APY :', dailyRate2APYCompounding(providerRatePerDay));
    console.log('min(oracleAPY, spotAPY, BOND_MAX_RATE_PER_DAY) :', dailyRate2APYCompounding(oracleRatePerDay), dailyRate2APYCompounding(spotDailyRate), dailyRate2APYCompounding(maxRatePerDay));
    console.log('sy spot APY (supply + distri) :', dailyRate2APYCompounding(spotDailyRate), `(${dailyRate2APYCompounding(spotDailySupplyRate)} + ${dailyRate2APYCompounding(spotDailyDistributionRate)})`);

    try {
      const {compGot, underlyingHarvestReward} = await controller.callStatic.harvest(0);
      console.log('harvestReward   :', underlyingHarvestReward.toString());
      console.log('harvestCompGot  :', compGot.toString());
    } catch (e) {
      console.log('harvestReward   : FAILED.');
    }

    console.log('spotCompToUnderlying 1 COMP=', spotCompToUnderlying.toString());
    console.log('---------');
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
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const whaleSign = await impersonate(deployerSign)(WBTCwhale);

    const underlying = ERC20Factory.connect(WBTC, deployerSign);
    const cToken = ICTokenFactory.connect(cWBTC, deployerSign);
    const comp = ERC20Factory.connect(COMP, deployerSign);
    const compoundComptroller = IComptrollerFactory.connect(cComptroller, deployerSign);

    await underlying.connect(whaleSign).approve(cToken.address, BN.from(e18(e18(e18(1)))));

    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployCompoundProvider(deployerSign, cWBTC),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployCompoundController(deployerSign, pool.address, smartYield.address, bondModel.address, uniswapPath),
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
      oracle, smartYield, cToken, bondModel, seniorBond, underlying, controller, pool, compoundComptroller, comp,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(cToken, whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      mintCtoken: mintCtoken(cToken, whaleSign as unknown as Wallet),
      redeemCtoken: redeemCtoken(cToken, whaleSign as unknown as Wallet),
      dumpState: dumpState(cToken, controller, smartYield, pool, oracle, oracleCONF.granularity),
    };
  };
};


describe('yield expected WBTC', async function () {

  it('test yield', async function () {

    const { whaleSign, pool, cToken, comp, oracle, currentBlock, moveTime, buyTokens, buyBond, mintCtoken, redeemCtoken, dumpState, controller } = await bbFixtures(fixture());

    await buyTokens(whaleSign as unknown as Wallet, e(1_000, decimals));

    let skipBlocks = 0;

    for (let i = 0; i < 100; i++) {
      await mineBlocks(BLOCKS_A_PERIOD / 5 - skipBlocks);
      skipBlocks = 0;

      //await (await cToken.connect(whaleSign).accrueInterest()).wait();

      if (i % 20 == 19) {
        skipBlocks++;
        await forceNextTime();
        console.log('+++ HARVEST!');
        try {
          const harv = await (await controller.harvest(0)).wait();
          console.log('harvest gas >>>>>>>>>>>>>>>>>>>>>>>>>> ', harv.gasUsed.toString());
        } catch (e) {
          console.log('harvest FAILED!', e);
        }
        console.log('--- HARVEST!');
      }

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
        await buyTokens(whaleSign as unknown as Wallet, e(10, decimals));
      }

      if (i % 20 == 19) {
        skipBlocks++;
        await forceNextTime();
        await buyBond(whaleSign as unknown as Wallet, e(10, decimals), 30);
      }

      //await mineBlocks(1);

      console.log(`[${i}]`);
      skipBlocks++;
      await forceNextTime();
      await (await cToken.connect(whaleSign).accrueInterest()).wait();
      await dumpState();
    }

  }).timeout(500 * 1000);

});
