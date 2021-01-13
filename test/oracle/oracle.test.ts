// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract, } from 'ethereum-waffle';

import { withCompoundRate, toWei, bondSlippage, toBNj, e18, mineBySeconds, blockDump, toBN, MAX_UINT256, A_DAY, ERROR_MARGIN_BAD, ERROR_MARGIN_PREFERED, ERROR_MARGIN_OKISH, e18j } from '@testhelp/index';
import { bbFixtures } from './../migrations';

import OraclelizedMockArtifact from '../../artifacts/contracts/mocks/barnbridge/OraclelizedMock.sol/OraclelizedMock.json';
import YieldOracleArtifact from './../../artifacts/contracts/lib/oracle/YieldOracle.sol/YieldOracle.json';

import { YieldOracle } from '@typechain/YieldOracle';
import { OraclelizedMock } from '@typechain/OraclelizedMock';

const START_TIME = 1614556800; // 03/01/2021 @ 12:00am (UTC)
let timePrev = BN.from(START_TIME);

const DAYS_PER_YEAR = 365;
const BLOCKS_PER_YEAR = 2_102_400;
const BLOCKS_PER_DAY = BN.from(BLOCKS_PER_YEAR).div(DAYS_PER_YEAR);

const defaultWindowSize = A_DAY * 3;
const defaultGranularity = 12 * 3; // samples in window


const moveTime = (oraclelizedMock: OraclelizedMock) => {
  return async (seconds: number | BN | BNj) => {
    seconds = BN.from(seconds.toString());
    timePrev = timePrev.add(seconds);
    await oraclelizedMock.setCurrentTime(timePrev);
  };
};

const yieldPerPeriod = (yieldPerDay: BN, underlying: BN, windowSize: number, granularity: number) => {
  const period = BN.from(windowSize).div(granularity);
  return underlying.mul(yieldPerDay).mul(period).div(A_DAY).div(e18(1)).add(1);
};


const fixture = (windowSize: number, granularity: number, underlyingDecimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign] = wallets;
    const [deployerAddr, ownerAddr] = await Promise.all([
      deployerSign.getAddress(),
      ownerSign.getAddress(),
    ]);

    const oraclelizedMock = (await deployContract(deployerSign, OraclelizedMockArtifact, [underlyingDecimals])) as OraclelizedMock;
    const yieldOracle = (await deployContract(deployerSign, YieldOracleArtifact, [oraclelizedMock.address, windowSize, granularity])) as YieldOracle;
    await oraclelizedMock.setOracle(yieldOracle.address);

    await (moveTime(oraclelizedMock))(0);

    return {
      yieldOracle, oraclelizedMock,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      deployerAddr, ownerAddr,
      moveTime: moveTime(oraclelizedMock),
    };
  };
};

describe('Yield Oracle', async function () {
  it('should deploy YieldOracle corectly', async function () {
    const { yieldOracle, oraclelizedMock } = await bbFixtures(fixture(defaultWindowSize, defaultGranularity, 18));

    expect(await yieldOracle.pool()).equals(oraclelizedMock.address, 'Oraclelized address');
    expect(await oraclelizedMock.oracle()).equals(yieldOracle.address, 'Yield Oracle address');
    expect(await yieldOracle.windowSize()).deep.equals(BN.from(defaultWindowSize), 'Oracle windowSize');
    expect(await yieldOracle.granularity()).equals(defaultGranularity, 'Oracle granularity');
    expect(await yieldOracle.periodSize()).deep.equals(BN.from(defaultWindowSize).div(defaultGranularity), 'Oracle periodSize');
    expect(await yieldOracle.consult(A_DAY)).deep.equals(BN.from(0), 'First consult should zero');
  });

  it('should overflow as expected', async function () {
    const { oraclelizedMock } = await bbFixtures(fixture(defaultWindowSize, defaultGranularity, 18));
    expect(await oraclelizedMock.cumulativeOverflowProof(0)).deep.equals(BN.from(0), 'should be 0');
    expect(await oraclelizedMock.cumulativeOverflowProof(1)).deep.equals(BN.from(1), 'should be 1');
    expect(await oraclelizedMock.cumulativeOverflowProof(1000000)).deep.equals(BN.from(1000000), 'should be 1000000');
    expect(await oraclelizedMock.cumulativeOverflowProof(MAX_UINT256)).deep.equals(MAX_UINT256, 'should be MAX_UINT256');
  });

  describe('happy paths', () => {

    it('should not bork for large underlying (9t)(e18)', async function () {
      const days = 6;
      const windowSize = A_DAY * days;
      const granularity = 2 * days;
      const yield_per_day = BN.from(23456518266).mul(BLOCKS_PER_DAY);

      let underlying = e18('9000000000000');

      const { yieldOracle, oraclelizedMock, moveTime } = await bbFixtures(fixture(windowSize, granularity, 18));

      expect(await yieldOracle.consult(A_DAY)).deep.equals(BN.from(0), 'should be 0');

      for (let i = 0; i < granularity * 2; i++) {
        underlying = underlying.add(yieldPerPeriod(yield_per_day, underlying, windowSize, granularity));
        await oraclelizedMock.setUnderlyingAndCumulate(underlying);
        if (i < granularity) {
          expect(await yieldOracle.consult(A_DAY)).deep.equal(BN.from(0), 'should be 0 for i=' + i);
        } else {
          expect(await yieldOracle.consult(A_DAY)).deep.equal(yield_per_day, 'not withing error for i=' + i);
        }
        await moveTime(windowSize / granularity);
      }
    });

    it('should not bork for small underlying (1)(e18)', async function () {
      const days = 6;
      const windowSize = A_DAY * days;
      const granularity = 2 * days;
      const yield_per_day = BN.from(23456518266).mul(BLOCKS_PER_DAY);

      let underlying = e18(1);

      const { yieldOracle, oraclelizedMock, moveTime } = await bbFixtures(fixture(windowSize, granularity, 18));

      expect(await yieldOracle.consult(A_DAY)).deep.equals(BN.from(0), 'should be 0');

      for (let i = 0; i < granularity * 2; i++) {
        underlying = underlying.add(yieldPerPeriod(yield_per_day, underlying, windowSize, granularity));
        await oraclelizedMock.setUnderlyingAndCumulate(underlying);
        if (i < granularity) {
          expect(await yieldOracle.consult(A_DAY)).deep.equal(BN.from(0), 'should be 0 for i=' + i);
        } else {
          expect(await yieldOracle.consult(A_DAY)).deep.equal(yield_per_day, 'not withing error for i=' + i);
        }
        await moveTime(windowSize / granularity);
      }
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
