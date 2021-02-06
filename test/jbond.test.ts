// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN } from '@testhelp/index';

import BondModelArtifact from '../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import { BondModelV1 } from '@typechain/BondModelV1';

import Erc20MockArtifact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { Erc20Mock } from '@typechain/Erc20Mock';

import ComptrollerMockArtifact from '../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
import { ComptrollerMock } from '@typechain/ComptrollerMock';

import CTokenMockArtifact from '../artifacts/contracts/mocks/compound-finance/CTokenYieldingMock.sol/CTokenYieldingMock.json';
import { CTokenYieldingMock } from '@typechain/CTokenYieldingMock';

import SmartYieldPoolCompoundMockArtifact from '../artifacts/contracts/mocks/barnbridge/SmartYieldPoolCompoundMock.sol/SmartYieldPoolCompoundMock.json';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';

import ControllerCompoundArtifact from '../artifacts/contracts/ControllerCompound.sol/ControllerCompound.json';
import { ControllerCompound } from '@typechain/ControllerCompound';

import YieldOracleArtifact from '../artifacts/contracts/oracle/YieldOracle.sol/YieldOracle.json';
import { YieldOracle } from '@typechain/YieldOracle';

import JuniorBondArtifact from '../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
import { JuniorBond } from '@typechain/JuniorBond';

import SeniorBondArtifact from '../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
import { SeniorBond } from '@typechain/SeniorBond';

import JuniorTokenArtifact from '../artifacts/contracts/JuniorToken.sol/JuniorToken.json';
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

const buyJuniorBond = (pool: SmartYieldPoolCompoundMock, token: JuniorToken) => {
  return async (user: Wallet, tokenAmount: number | BN, maxMaturesAt: number | BN) => {
    tokenAmount = toBN(tokenAmount);
    maxMaturesAt = toBN(maxMaturesAt);
    await token.connect(user).approve(pool.address, tokenAmount);
    await pool.connect(user).buyJuniorBond(tokenAmount, maxMaturesAt, currentTime().add(1));
  };
};

const redeemJuniorBond = (pool: SmartYieldPoolCompoundMock) => {
  return async (user: Wallet, id: number | BN) => {
    id = toBN(id);
    await pool.connect(user).redeemJuniorBond(id);
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
      buyJuniorBond: buyJuniorBond(pool, juniorToken),
      redeemJuniorBond: redeemJuniorBond(pool),
      buyBond: buyBond(pool, underlying),
      redeemBond: redeemBond(pool, underlying),
      moveTime: moveTime(pool),
    };
  };
};

describe('junior bonds: buyJuniorBond()', async function () {
  it('should deploy contracts correctly', async function () {
    const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken } = await bbFixtures(fixture(decimals));

    // expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    // expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    // expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    // expect(await pool.seniorBond()).equals(seniorBond.address, 'pool.seniorBond()');
    // expect(await pool.juniorBond()).equals(juniorBond.address, 'pool.juniorBond()');
    // expect(await pool.juniorToken()).equals(juniorToken.address, 'pool.juniorToken()');
    // expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    // expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    // expect(await oracle.pool()).equals(pool.address, 'oracle.pool()');
  });

  describe('purchase junior bonds', async function () {

    it('liquidation works', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1, senior2 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(101));
      await buyTokens(junior3, e18(101));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(100), 0, 30);
      await moveTime(A_DAY * 1);

      await buyBond(senior2, e18(100), 0, 30);
      await moveTime(A_DAY * 1);

      await buyJuniorBond(junior1, e18(100), currentTime().add(1000 * A_DAY));
      await buyJuniorBond(junior2, e18(100), currentTime().add(1000 * A_DAY));

      let storage = await pool.st();
      console.log('tokensInJuniorBonds >>> ', storage.tokensInJuniorBonds.toString());
      expect(storage.tokensInJuniorBonds, 'storage.tokensInJuniorBonds should be 200').deep.equal(e18(200));
      await moveTime(A_DAY * 25 + 1);

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'x oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(100), 0, 1);

      storage = await pool.st();
      console.log('tokensInJuniorBonds         >>> ', storage.tokensInJuniorBonds.toString());
      expect(storage.tokensInJuniorBonds, 'storage.tokensInJuniorBonds should be 200').deep.equal(e18(0));
      console.log('underlyingLiquidatedJuniors >>> ', storage.underlyingLiquidatedJuniors.toString());
      const price = await pool.price();
      //expect(storage.underlyingLiquidatedJuniors, 'storage.underlyingLiquidatedJuniors').deep.equal(price.mul(e18(200)).div(e18(1)));
      expect(storage.underlyingLiquidatedJuniors.gt(0), 'storage.underlyingLiquidatedJuniors').equal(true);

      await redeemJuniorBond(junior1, 1);
      const underlyingGot1 = await underlying.balanceOf(junior1.address);

      await moveTime(A_DAY * 100);

      await redeemJuniorBond(junior2, 2);
      const underlyingGot2 = await underlying.balanceOf(junior2.address);


      expect(underlyingGot1, 'both juniors get the same amount').deep.equal(underlyingGot2);

      return;

      const potentialSellUnderlying = (await pool.price()).mul(e18(100)).sub((await pool.abondDebt()).mul(e18(1)).div(3)).div(e18(1));
      await buyJuniorBond(junior1, e18(100), currentTime().add(100 * A_DAY).add(1));

      await cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY * 5));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }

      await buyBond(senior1, e18(1000), 0, 90);

      await cToken.setYieldPerDay(0);

      await moveTime(A_DAY * 25 + 1);

      const expectedUnderlying = (await pool.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(expectedUnderlying.sub(potentialSellUnderlying).lt(0), 'expectedUnderlying is larger').equal(true);

    }).timeout(100 * 1000);

    it('junior bond redeem', async function () {
      return;
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(100), currentTime().add(20 * A_DAY).add(1));
      await moveTime(1 + A_DAY * 20);

      const expectedUnderlying = (await pool.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(await underlying.balanceOf(junior1.address), 'should receive correct amount').deep.equal(expectedUnderlying);
      await expect(redeemJuniorBond(senior1, 1), 'already redeemed should revert').revertedWith('ERC721: owner query for nonexistent token');
      await expect(redeemJuniorBond(senior1, 10000), 'redeemed should revert for unexisting jBonds').revertedWith('ERC721: owner query for nonexistent token');
    });

    it('redeemJuniorBond() can return less than sellToken() extreme conditions', async function () {
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(100));
      await buyTokens(junior3, e18(100));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(100), 0, 30);
      await moveTime(A_DAY * 1);


      const potentialSellUnderlying = (await pool.price()).mul(e18(100)).sub((await pool.abondDebt()).mul(e18(1)).div(3)).div(e18(1));
      await buyJuniorBond(junior1, e18(100), currentTime().add(100 * A_DAY).add(1));

      await cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY * 5));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }

      await buyBond(senior1, e18(1000), 0, 90);

      await cToken.setYieldPerDay(0);

      await moveTime(A_DAY * 25 + 1);

      const expectedUnderlying = (await pool.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(expectedUnderlying.sub(potentialSellUnderlying).lt(0), 'expectedUnderlying is larger').equal(true);

    }).timeout(100 * 1000);

    it('junior gets jbond', async function () {
      return;
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, buyJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(10), currentTime().add(20 * A_DAY).add(1));

      const abond = await pool.abond();
      const jBond = await pool.juniorBonds(1);

      expect(jBond.tokens, 'tokens should be correct').deep.equal(e18(10));
      expect(jBond.maturesAt, 'maturesAt should be correct').deep.equal(abond.maturesAt.div(e18(1)).add(1));
      expect(await juniorToken.balanceOf(junior1.address), 'junior1 should have 90 jtokens').equal(e18(90));
      expect(await juniorToken.balanceOf(pool.address), 'pool should have 10 jtokens').equal(e18(10));
      expect(await juniorBond.ownerOf(1), 'bond onwer should be correct').equal(junior1.address);
      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 1 bond').deep.equal(BN.from(1));
      expect(await juniorBond.tokenOfOwnerByIndex(junior1.address, 0), 'id of junior1\'s first bond should be #1').deep.equal(BN.from(1));
    });

    it('when buying jBonds juniorBondsMaturities is properly sorted', async function () {
      return;
      const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, juniorToken, moveTime, buyTokens, buyBond, buyJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(1000));
      await buyTokens(junior2, e18(1000));
      await buyTokens(junior3, e18(1000));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(1000), 0, 90);
      await moveTime(A_DAY * 1);

      const expected = [];

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior1, e18(10), currentTime().add(100 * A_DAY));
      await moveTime(A_DAY);

      await buyBond(senior1, e18(1000), 0, 70);

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 60);

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 50);

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 40);

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 30);

      expected.push((await pool.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 20);

      const got = (await pool.juniorBondsMaturities());

      expected
        .sort((a, b) => a.sub(b).toNumber())
        .map((v, i) => {
          expect(v, `item not sorted, for i=${i}`).deep.equal(got[i]);
        });

    }).timeout(100 * 1000);


  });
});
