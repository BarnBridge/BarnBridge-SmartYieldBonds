// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN } from '@testhelp/index';

import BondModelArtifact from './../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import { BondModelV1 } from '@typechain/BondModelV1';

import Erc20MockArtifact from './../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { Erc20Mock } from '@typechain/Erc20Mock';

import ComptrollerMockArtifact from './../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
import { ComptrollerMock } from '@typechain/ComptrollerMock';

import CTokenMockArtifact from './../artifacts/contracts/mocks/compound-finance/CTokenYieldingMock.sol/CTokenYieldingMock.json';
import { CTokenYieldingMock } from '@typechain/CTokenYieldingMock';

import SmartYieldPoolCompoundMockArtifact from './../artifacts/contracts/mocks/barnbridge/SmartYieldPoolCompoundMock.sol/SmartYieldPoolCompoundMock.json';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';

import ControllerCompoundArtifact from './../artifacts/contracts/ControllerCompound.sol/ControllerCompound.json';
import { ControllerCompound } from '@typechain/ControllerCompound';

import YieldOracleArtifact from './../artifacts/contracts/oracle/YieldOracle.sol/YieldOracle.json';
import { YieldOracle } from '@typechain/YieldOracle';

import JuniorBondArtifact from './../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
import { JuniorBond } from '@typechain/JuniorBond';

import SeniorBondArtifact from './../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
import { SeniorBond } from '@typechain/SeniorBond';

import JuniorTokenArtifact from './../artifacts/contracts/JuniorToken.sol/JuniorToken.json';
import { JuniorToken } from '@typechain/JuniorToken';

const START_TIME = 1614556800; // 03/01/2021 @ 12:00am (UTC)
let timePrev = BN.from(START_TIME);

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

const moveTime = (pool: SmartYieldPoolCompoundMock) => {
  return async (seconds: number | BN | BNj) => {
    seconds = BN.from(seconds.toString());
    timePrev = timePrev.add(seconds);
    await pool.setCurrentTime(timePrev);
  };
};

const currentTime = () => {
  return timePrev;
};

const buyTokens = (pool: SmartYieldPoolCompoundMock, underlying: Erc20Mock) => {
  return async (user: Wallet, amountUnderlying: number | BN) => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.mintMock(user.address, amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await pool.connect(user).buyTokens(amountUnderlying, 0, currentTime().add(1));
  };
};

const sellTokens = (pool: SmartYieldPoolCompoundMock, token: JuniorToken) => {
  return async (user: Wallet, amountTokens: number | BN) => {
    amountTokens = toBN(amountTokens);
    await token.connect(user).approve(pool.address, amountTokens);
    await pool.connect(user).sellTokens(amountTokens, 0, currentTime().add(1));
  };
};

const buyBond = (pool: SmartYieldPoolCompoundMock, underlying: Erc20Mock) => {
  return async (user: Wallet, amountUnderlying: number | BN, minGain: number | BN, forDays: number | BN) => {
    amountUnderlying = toBN(amountUnderlying);
    forDays = toBN(forDays);
    minGain = toBN(minGain);
    await underlying.mintMock(user.address, amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await pool.connect(user).buyBond(amountUnderlying, minGain, currentTime().add(1), forDays);
  };
};

const redeemBond = (pool: SmartYieldPoolCompoundMock, underlying: Erc20Mock) => {
  return async (user: Wallet, id: number | BN) => {
    id = toBN(id);
    await pool.connect(user).redeemBond(id);
  };
};

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const [bondModel, underlying, comptroller, pool, controller] = await Promise.all([
      (deployContract(deployerSign, BondModelArtifact, [])) as Promise<BondModelV1>,
      (deployContract(deployerSign, Erc20MockArtifact, ['DAI mock', 'DAI', decimals])) as Promise<Erc20Mock>,
      (deployContract(deployerSign, ComptrollerMockArtifact, [])) as Promise<ComptrollerMock>,
      (deployContract(deployerSign, SmartYieldPoolCompoundMockArtifact, [])) as Promise<SmartYieldPoolCompoundMock>,
      (deployContract(deployerSign, ControllerCompoundArtifact, [])) as Promise<ControllerCompound>,
    ]);

    const [cToken, oracle, seniorBond, juniorBond, juniorToken] = await Promise.all([
      (deployContract(deployerSign, CTokenMockArtifact, [underlying.address, comptroller.address, pool.address, exchangeRateStored])) as Promise<CTokenYieldingMock>,
      (deployContract(deployerSign, YieldOracleArtifact, [pool.address, 4 * A_DAY, 4])) as Promise<YieldOracle>,
      (deployContract(deployerSign, SeniorBondArtifact, ['sBOND mock', 'sBOND mock', pool.address])) as Promise<SeniorBond>,
      (deployContract(deployerSign, JuniorBondArtifact, ['jBOND mock', 'jBOND mock', pool.address])) as Promise<JuniorBond>,
      (deployContract(deployerSign, JuniorTokenArtifact, ['bbDAI mock', 'bbDAI', pool.address])) as Promise<JuniorToken>,
    ]);

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setBondModel(bondModel.address),
      comptroller.setHolder(pool.address),
      comptroller.setMarket(cToken.address),
      pool.setup(controller.address, seniorBond.address, juniorBond.address, juniorToken.address, cToken.address),
      cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY)),
      controller.setFeeBuyJuniorToken(e18(0).div(100)),
    ]);

    await (moveTime(pool))(0);

    return {
      oracle, pool, cToken, bondModel, seniorBond, juniorBond, juniorToken, underlying, controller,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(pool, underlying),
      sellTokens: sellTokens(pool, juniorToken),
      buyBond: buyBond(pool, underlying),
      redeemBond: redeemBond(pool, underlying),
      moveTime: moveTime(pool),
    };
  };
};

describe('tokens: buyTokens()', async function () {
  it('should deploy contracts correctly', async function () {
    const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await pool.seniorBond()).equals(seniorBond.address, 'pool.seniorBond()');
    expect(await pool.juniorBond()).equals(juniorBond.address, 'pool.juniorBond()');
    expect(await pool.juniorToken()).equals(juniorToken.address, 'pool.juniorToken()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    expect(await oracle.pool()).equals(pool.address, 'oracle.pool()');
  });

  describe('instant withdraw', async function () {
    it('if there\'s debt, it is forfeit', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, sellTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      const tokensBefore = await juniorToken.balanceOf(junior1.address);

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 20);

      const underlyingBefore = (await pool.price()).mul(tokensBefore).div(e18(1));
      const underlyingDebt = (await pool.abondDebt());
      await sellTokens(junior1, tokensBefore);
      const underlyingGot = (await underlying.balanceOf(junior1.address));

      expect(underlyingBefore.sub(underlyingGot), 'user got too much').deep.equal(underlyingDebt);
      expect(await pool.price(), 'price should be 1 (1)').deep.equal(e18(1));
      await moveTime(A_DAY * 20);

      expect(await pool.price(), 'price should be 1 (2)').deep.equal(e18(1));
      expect(await pool.abondDebt(), 'debt should be 0').deep.equal(e18(0));
    });

    it('if there\'s debt, it is forfeit with multiple juniors', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, sellTokens, buyBond, junior1, junior2, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      const tokensBefore1 = await juniorToken.balanceOf(junior1.address);

      await buyTokens(junior2, e18(900));
      const tokensBefore2 = await juniorToken.balanceOf(junior2.address);

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 20);

      const underlyingBefore1 = (await pool.price()).mul(tokensBefore1).div(e18(1));
      const underlyingDebt = (await pool.abondDebt());
      await sellTokens(junior1, tokensBefore1);
      const underlyingGot1 = (await underlying.balanceOf(junior1.address));

      console.log('diff >', underlyingBefore1.sub(underlyingGot1).toString());
      console.log('debt >', underlyingDebt.mul(100).div(1000).toString());

      expect(underlyingBefore1.sub(underlyingGot1), 'user got too much').deep.equal(underlyingDebt.mul(100).div(1000));
    });
  });

  describe('buyTokens', async function () {
    it('junior gets tokens', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const tokensBefore = await juniorToken.balanceOf(junior1.address);
      await buyTokens(junior1, e18(100));
      const tokensAfter = await juniorToken.balanceOf(junior1.address);
      expect(tokensBefore, 'balance before should be 0').equal(0);
      expect(tokensAfter, 'balance after should be 100').deep.equal(e18(100));
    });
  });

  describe('price', async function () {

    it('yield decreases after buyBond, price goes down', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const priceBefore = await pool.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);

      await cToken.setYieldPerDay(0);

      await moveTime(A_DAY * 10);

      const priceNow = await pool.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      expect(priceNow.lt(priceBefore), 'price now not lower (1)').equal(true);

      await moveTime(A_DAY * 20);

      const priceNow2 = await pool.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      console.log('priceNow2', priceNow2.toString());
      expect(priceNow2.lt(priceNow), 'price now not even lower (2)').equal(true);
    });

    it('yield increases after buyBond, price goes up', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const priceBefore = await pool.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      console.log('Bond Gain', (await bondModel.gain(pool.address, e18(1000), 30)).toString());
      await buyBond(senior1, e18(1000), 0, 30);

      await cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY).mul(2));

      await moveTime(A_DAY * 10);

      const priceNow = await pool.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      expect(priceNow.gt(priceBefore), 'price now not greater (1)').equal(true);

      await moveTime(A_DAY * 20);

      const priceNow2 = await pool.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      console.log('priceNow2', priceNow2.toString());
      expect(priceNow2.gt(priceNow), 'price now not even greater (2)').equal(true);
    });

    it('price doesn\'t change before and after buyTokens', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);

      const priceBefore = await pool.price();
      await buyTokens(junior1, e18(1000));
      expect(await pool.price(), 'price changed').deep.equal(priceBefore);
    });

    it('price doesn\'t change before and after buyBond', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);

      const priceBefore = await pool.price();
      await buyBond(senior1, e18(1000), 0, 30);
      expect(await pool.price(), 'price changed').deep.equal(priceBefore);
    });

    it('with no yield price stays the same', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await cToken.setYieldPerDay(0);

      const priceBefore = await pool.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);
      expect(await pool.price(), 'price changed (1)').deep.equal(priceBefore.sub(1));
      await buyTokens(junior1, e18(1000));
      expect(await pool.price(), 'price changed (2)').deep.equal(priceBefore.sub(1));
    });


  });

  //      cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY)),

  //console.log('price:', (await pool.price()).toString());

  // console.log('underlying total>>>', (await pool.underlyingTotal()).toString() );

  // await buyTokens(junior1, e18(1000));
  // console.log('price:', (await pool.price()).toString());
  // await moveTime(A_DAY);
  // console.log('underlying total>>>', (await pool.underlyingTotal()).toString() );

  // console.log('pool cToken:', (await cToken.balanceOf(pool.address)).toString());

  // await buyTokens(junior1, e18(1000));
  // console.log('price:', (await pool.price()).toString());
  // await moveTime(A_DAY / 2);
  // console.log('underlying total>>>', (await pool.underlyingTotal()).toString() );

  // await oracle.update();

  // await moveTime(A_DAY / 2);
  // await oracle.update();
  // console.log('underlying total>>>', (await pool.underlyingTotal()).toString() );

  // console.log('oracle>>>', (await oracle.consult(A_DAY)).toString(), 'vs', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString() );

  // console.log('underlying total>>>', (await pool.underlyingTotal()).toString() );

  // console.log('pool cToken:', (await cToken.balanceOf(pool.address)).toString());

  // await buyBond(senior1, e18(1000), 0, 30);



  // const bond = await pool.seniorBonds(1);
  // console.log('Bond:', bond.gain.toString());
  // console.log('price:', (await pool.price()).toString());

});
