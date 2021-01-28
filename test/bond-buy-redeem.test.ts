// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN } from '@testhelp/index';

import BondModelMockArtifact from '../artifacts/contracts/mocks/barnbridge/BondModelMock.sol/BondModelMock.json';
import BondTokenArtifact from '../artifacts/contracts/BondToken.sol/BondToken.json';
import Erc20MockArtifact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import CTokenMockArtifact from '../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import SmartYieldPoolCompoundMockArtifact from '../artifacts/contracts/mocks/barnbridge/SmartYieldPoolCompoundMock.sol/SmartYieldPoolCompoundMock.json';
import YieldOracleMockArtifact from '../artifacts/contracts/mocks/barnbridge/YieldOracleMock.sol/YieldOracleMock.json';

import { YieldOracleMock } from '@typechain/YieldOracleMock';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';
import { BondModelMock } from '@typechain/BondModelMock';
import { BondToken } from '@typechain/BondToken';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { CTokenMock } from '@typechain/CTokenMock';

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

    const bondModel = (await deployContract(deployerSign, BondModelMockArtifact, [])) as BondModelMock;
    const underlying = (await deployContract(deployerSign, Erc20MockArtifact, ['DAI MOCK', 'DAI', decimals])) as Erc20Mock;
    const cToken = (await deployContract(deployerSign, CTokenMockArtifact, [underlying.address])) as CTokenMock;
    const pool = (await deployContract(deployerSign, SmartYieldPoolCompoundMockArtifact, ['bbDAI', 'bbDAI MOCK'])) as SmartYieldPoolCompoundMock;
    const oracle = (await deployContract(deployerSign, YieldOracleMockArtifact, [])) as YieldOracleMock;
    const bondToken = (await deployContract(deployerSign, BondTokenArtifact, ['BOND', 'BOND MOCK', pool.address])) as BondToken;
    await pool.setup(oracle.address, bondModel.address, bondToken.address, cToken.address, decimals);

    await (moveTime(pool))(0);

    return {
      oracle, pool, cToken, bondModel, bondToken, underlying,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(pool, underlying),
      buyBond: buyBond(pool, underlying),
      redeemBond: redeemBond(pool, underlying),
      moveTime: moveTime(pool),
    };
  };
};

describe('buyBond() / redeemBond()', async function () {
  it('should deploy contracts correctly', async function () {
    const decimals = 18;
    const { pool, oracle, bondModel, cToken, underlying, bondToken } = await bbFixtures(fixture(decimals));

    expect(await pool.oracle()).equals(oracle.address, 'pool.oracle()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await pool.bondModel()).equals(bondModel.address, 'pool.bondModel()');
    expect(await pool.bondToken()).equals(bondToken.address, 'pool.bondToken()');
  });

  it('MathUtils.compound works', async function () {
    const decimals = 18;
    const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
    const { pool, oracle, bondModel, cToken, underlying, bondToken } = await bbFixtures(fixture(decimals));

    await bondModel.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 1);
    expect(await bondModel.compoundingTestLast(), 'MathUtils.compound not working (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));

    await bondModel.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 365);
    expect(await bondModel.compoundingTestLast(), 'MathUtils.compound not working (2)').deep.equal(BN.from('89437198474492656'));
  });

  describe('buyBond()', async function () {
    it('buyBond require forDays / minGain / allowance', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, buyTokens, junior1 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(10));
      await expect(pool.buyBond(e18(1), 0, currentTime().add(1), 0), 'should throw for 0 days bond').revertedWith('ASYP: buyBond forDays');
      await expect(pool.buyBond(e18(1), 0, currentTime().sub(1), 10), 'should throw for deadline').revertedWith('ASYP: buyBond deadline');
      await expect(pool.buyBond(e18(1), 0, currentTime().add(1), 91), 'should throw for > BOND_MAX_LIFE days bond (1)').revertedWith('ASYP: buyBond forDays');
      await pool.setBondMaxLife(100);
      await expect(pool.buyBond(e18(1), 0, currentTime().add(1), 101), 'should throw for > BOND_MAX_LIFE days bond (2)').revertedWith('ASYP: buyBond forDays');
      await expect(pool.buyBond(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY).add(1), currentTime().add(1), 1), 'should throw if gain below min').revertedWith('ASYP: buyBond minGain');

      await expect(pool.buyBond(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), currentTime().add(1), 1), 'should not throw (1)').not.revertedWith('ASYP: buyBond minGain');
      await expect(pool.buyBond(e18(1), 0, currentTime().add(1), 100), 'should not throw (2)').not.revertedWith('ASYP: buyBond forDays');

      await expect(pool.buyBond(e18(1), 0, currentTime().add(1), 100), 'should throw if no allowance').revertedWith('SYCOMP: _takeUnderlying allowance');
    });

    it('TODO: buyBond require gain < underlyingJuniors', async function () {
      // TODO:
      console.error('TODO: buyBond require gain < underlyingJuniors');
      return;
    });

    it('buyBond creates a correct bond token', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, junior1, senior1, buyTokens, buyBond, moveTime } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(10));
      await buyBond(senior1, e18(1), 1, 1);

      expect(await bondToken.balanceOf(senior1.address), 'senior should have 1 tokens').deep.equal(BN.from(1));
      expect(await bondToken.tokenOfOwnerByIndex(senior1.address, 0), 'id of first token should be 1').deep.equal(BN.from(1));
      expect(await bondToken.ownerOf(1), 'correct owner').equal(senior1.address);

      const bondMeta = await pool.bonds(1);

      expect(bondMeta.principal, 'bondMeta.principal').deep.equal(e18(1));
      expect(bondMeta.gain, 'bondMeta.gain').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      expect(bondMeta.issuedAt, 'bondMeta.issuedAt').deep.equal(currentTime());
      expect(bondMeta.maturesAt, 'bondMeta.maturesAt').deep.equal(currentTime().add(A_DAY));
      expect(bondMeta.liquidated, 'bondMeta.liquidated').equal(false);

      expect(await underlying.balanceOf(cToken.address), 'underlying deposits should match').deep.equal(e18(10).add(e18(1)));
    });

    it('buyBond creates several correct bond tokens', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, junior1, senior1, senior2, buyTokens, buyBond, moveTime } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(10));

      const gain1 = supplyRatePerBlock.mul(BLOCKS_PER_DAY);
      const issued1 = currentTime();
      await buyBond(senior1, e18(1), 1, 1); // id 1

      await moveTime(10);

      const gain2 = await pool.bondGain(e18(1.1), 5);
      const issued2 = currentTime();
      await buyBond(senior2, e18(1.1), 1, 5); // id 2

      await moveTime(10);

      const gain3 = await pool.bondGain(e18(1.5), 30);
      const issued3 = currentTime();
      await buyBond(senior1, e18(1.5), 1, 30); // id 3


      expect(await bondToken.balanceOf(senior1.address), 'senior should have 2 tokens').deep.equal(BN.from(2));
      expect(await bondToken.balanceOf(senior2.address), 'senior should have 1 tokens').deep.equal(BN.from(1));
      expect(await bondToken.tokenOfOwnerByIndex(senior1.address, 0), 'senior1 id of first token should be 1').deep.equal(BN.from(1));
      expect(await bondToken.tokenOfOwnerByIndex(senior1.address, 1), 'senior1 id of second token should be 3').deep.equal(BN.from(3));
      expect(await bondToken.tokenOfOwnerByIndex(senior2.address, 0), 'senior1 id of first token should be 2').deep.equal(BN.from(2));

      expect(await bondToken.ownerOf(1), 'correct owner 1').equal(senior1.address);
      expect(await bondToken.ownerOf(2), 'correct owner 2').equal(senior2.address);
      expect(await bondToken.ownerOf(3), 'correct owner 3').equal(senior1.address);

      const [bond1, bond2, bond3] = await Promise.all([pool.bonds(1), pool.bonds(2), pool.bonds(3)]);

      expect(bond1.principal, 'bond1.principal').deep.equal(e18(1));
      expect(bond1.gain, 'bond1.gain').deep.equal(gain1);
      expect(bond1.issuedAt, 'bond1.issuedAt').deep.equal(issued1);
      expect(bond1.maturesAt, 'bond1.maturesAt').deep.equal(issued1.add(A_DAY));
      expect(bond1.liquidated, 'bond1.liquidated').equal(false);

      expect(bond2.principal, 'bond2.principal').deep.equal(e18(1.1));
      expect(bond2.gain, 'bond2.gain').deep.equal(gain2);
      expect(bond2.issuedAt, 'bond2.issuedAt').deep.equal(issued2);
      expect(bond2.maturesAt, 'bond2.maturesAt').deep.equal(issued2.add(5 * A_DAY));
      expect(bond2.liquidated, 'bond2.liquidated').equal(false);

      expect(bond3.principal, 'bond3.principal').deep.equal(e18(1.5));
      expect(bond3.gain, 'bond3.gain').deep.equal(gain3);
      expect(bond3.issuedAt, 'bond3.issuedAt').deep.equal(issued3);
      expect(bond3.maturesAt, 'bond3.maturesAt').deep.equal(issued3.add(30 * A_DAY));
      expect(bond3.liquidated, 'bond3.liquidated').equal(false);

      expect(await underlying.balanceOf(cToken.address), 'underlying deposits should match').deep.equal(e18(10).add(e18(1).add(e18(1.1)).add(e18(1.5))));
    });

  });

  describe('redeemBond()', async function () {
    it('redeemBond require matured, unredeemed', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, buyTokens, buyBond, redeemBond, moveTime, junior1, senior1 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);

      await buyTokens(junior1, e18(10));
      await buyBond(senior1, e18(1), 1, 1);

      await expect(redeemBond(senior1, 1), 'should throw if not matured (1)').revertedWith('ASYP: redeemBond not matured');
      await moveTime(10);
      await expect(redeemBond(senior1, 1), 'should throw if not matured (2)').revertedWith('ASYP: redeemBond not matured');
      await moveTime(A_DAY - 10);
      await expect(redeemBond(senior1, 1), 'should throw if not matured (3)').revertedWith('ASYP: redeemBond not matured');
      await moveTime(1);
      await redeemBond(senior1, 1);
      await expect(redeemBond(senior1, 1), 'should revert if already redeemed').revertedWith('ERC721: owner query for nonexistent token');
    });

    it('redeemBond gives correct amounts', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, buyTokens, buyBond, redeemBond, moveTime, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);

      await buyTokens(junior1, e18(10));
      await moveTime(A_DAY);

      const gain1 = await pool.bondGain(e18(2), 30);
      await buyBond(senior1, e18(2), 1, 30);
      await moveTime(A_DAY);
      expect(await underlying.balanceOf(senior1.address), 'senior1 should have 0 underlying').deep.equal(BN.from(0));

      const gain2 = await pool.bondGain(e18(2.5), 25);
      await buyBond(senior2, e18(2.5), 1, 25);
      await moveTime(A_DAY);
      expect(await underlying.balanceOf(senior2.address), 'senior2 should have 0 underlying').deep.equal(BN.from(0));

      await moveTime(A_DAY * 30);
      await Promise.all([
        redeemBond(senior1, 1),
        redeemBond(senior2, 2),
      ]);

      expect(await underlying.balanceOf(senior1.address), 'senior1 should have correct underlying').deep.equal(e18(2).add(gain1));
      expect(await underlying.balanceOf(senior2.address), 'senior2 should have correct underlying').deep.equal(e18(2.5).add(gain2));
    });

    it('redeemBond gives amounts to owner', async function () {
      const { pool, oracle, bondModel, cToken, underlying, bondToken, buyTokens, buyBond, redeemBond, moveTime, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);

      await buyTokens(junior1, e18(10));

      const gain1 = await pool.bondGain(e18(2), 30);
      await buyBond(senior1, e18(2), 1, 30);
      expect(await underlying.balanceOf(senior1.address), 'senior1 should have 0 underlying').deep.equal(BN.from(0));

      await moveTime(A_DAY * 30 + 1);
      await redeemBond(senior2, 1); // anyone can call redeem but funds go to owner

      expect(await underlying.balanceOf(senior1.address), 'senior1 should have correct underlying').deep.equal(e18(2).add(gain1));
      expect(await underlying.balanceOf(senior2.address), 'senior2 should have 0 underlying').deep.equal(BN.from(0));
    });
  });


});
