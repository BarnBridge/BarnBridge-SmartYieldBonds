// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract,  } from 'ethereum-waffle';

import { withCompoundRate, toWei, bondSlippage, toBNj, e18, ERROR_MARGIN_ACCEPTABLE, mineBySeconds, blockDump, toBN } from '@testhelp/index';
import { bbFixtures } from './../migrations';

import OraclelizedMockArtifact from '../../artifacts/contracts/mocks/barnbridge/OraclelizedMock.sol/OraclelizedMock.json';
import YieldOracleArtifact from './../../artifacts/contracts/lib/oracle/YieldOracle.sol/YieldOracle.json';

import { YieldOracle } from '@typechain/YieldOracle';
import { OraclelizedMock } from '@typechain/OraclelizedMock';

const defaultWindowSize = 60 * 60 * 24 * 3;
const defaultGranularity = 12 * 3; // samples in window

const fixture = (windowSize: number, granularity: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign] = wallets;
    const [deployerAddr, ownerAddr] = await Promise.all([
      deployerSign.getAddress(),
      ownerSign.getAddress(),
    ]);

    const oraclelizedMock = (await deployContract(deployerSign, OraclelizedMockArtifact, [])) as OraclelizedMock;
    const yieldOracle = (await deployContract(deployerSign, YieldOracleArtifact, [oraclelizedMock.address, windowSize, granularity])) as YieldOracle;
    await oraclelizedMock.setOracle(yieldOracle.address);

    return {
      yieldOracle, oraclelizedMock,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      deployerAddr, ownerAddr,
    };
  };
};

describe('Yield Oracle', async function () {
  it('should deploy YieldOracle corectly', async function () {
    const { yieldOracle, oraclelizedMock } = await bbFixtures(fixture(defaultWindowSize, defaultGranularity));

    expect(await yieldOracle.pool()).equals(oraclelizedMock.address, 'Oraclelized address');
    expect(await oraclelizedMock.oracle()).equals(yieldOracle.address, 'Yield Oracle address');
    expect(await yieldOracle.windowSize()).deep.equals(BN.from(defaultWindowSize), 'Oracle windowSize');
    expect(await yieldOracle.granularity()).equals(defaultGranularity, 'Oracle granularity');
    expect(await yieldOracle.periodSize()).deep.equals(BN.from(defaultWindowSize).div(defaultGranularity), 'Oracle periodSize');
    expect(await yieldOracle.consult()).deep.equals(BN.from(0), 'First consult should zero');
  });

  describe('update()', () => {

    it('sets slots to 0 on initial update', async function () {

      const windowSize = 1 * 24 * 60 * 60;
      const granularity = 24;




      let newUnderlying = new BNj(5000);
      const yieldPerWindow = new BNj(0.05).div(granularity); // 5% / defaultWindowSize

      const { yieldOracle, oraclelizedMock } = await bbFixtures(fixture(windowSize, granularity));
      expect(await yieldOracle.consult()).deep.equals(BN.from(0), 'should be zero');

      await oraclelizedMock.setUnderlyingTotal(e18(newUnderlying));
      await mineBySeconds(1 * 60);

      expect(await yieldOracle.consult()).deep.equals(BN.from(0), 'should still be zero');

      for (let i = 0; i < granularity * 3; i++) {
        newUnderlying = newUnderlying.times(yieldPerWindow.plus(1));
        await oraclelizedMock.setUnderlyingTotal(e18(newUnderlying));
        await mineBySeconds(windowSize / granularity);
        console.error('consult():', (await yieldOracle.consult()).mul(windowSize).div(BN.from(10).pow(15)).toString());
      }



      console.error('--------------->', (await yieldOracle.consult()).toString());


    });

  });




  // it('should allow juniors to buy tokens', async function () {
  //   const { ctoken, underliying, pool, juniorToken, junior1Addr, junior2Addr, junior1Sign, junior2Sign } = await bbFixtures(fixture);

  //   await ctoken.setSupplyRatePerBlock(BN.from('14135523863'));
  //   await ctoken.setExchangeRateStored(BN.from('207578806244699024287878498'));

  //   await underliying.mintMock(junior1Addr, BN.from(1000));
  //   await underliying.connect(junior1Sign).approve(pool.address, BN.from(1000));

  //   await underliying.mintMock(junior2Addr, BN.from(1900));
  //   await underliying.connect(junior2Sign).approve(pool.address, BN.from(1900));

  //   await pool.connect(junior1Sign).buyToken(BN.from(1000));

  //   await pool.connect(junior2Sign).buyToken(BN.from(1900));

  //   expect(await juniorToken.balanceOf(junior1Addr)).deep.equals(BN.from(1000), 'Should have received 1000 jToken');
  //   expect(await juniorToken.balanceOf(junior2Addr)).deep.equals(BN.from(1900), 'Should have received 1900 jToken');

  //   expect(await pool.getsTokens(1)).deep.equals(BN.from(1), 'Token price should still be 1');
  // });

});
