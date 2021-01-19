// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy } from '@testhelp/index';

import BondModelMockArtifact from '../artifacts/contracts/mocks/barnbridge/BondModelMock.sol/BondModelMock.json';
import BondTokenMockArtifact from '../artifacts/contracts/mocks/barnbridge/BondTokenMock.sol/BondTokenMock.json';
import Erc20MockArtifact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import CTokenMockArtifact from '../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import SmartYieldPoolCompoundMockArtifact from '../artifacts/contracts/mocks/barnbridge/SmartYieldPoolCompoundMock.sol/SmartYieldPoolCompoundMock.json';
import YieldOracleMockArtifact from '../artifacts/contracts/mocks/barnbridge/YieldOracleMock.sol/YieldOracleMock.json';

import { YieldOracleMock } from '@typechain/YieldOracleMock';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';
import { BondModelMock } from '@typechain/BondModelMock';
import { BondTokenMock } from '@typechain/BondTokenMock';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { CTokenMock } from '@typechain/CTokenMock';

const START_TIME = 1614556800; // 03/01/2021 @ 12:00am (UTC)
let timePrev = BN.from(START_TIME);

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

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign] = wallets;
    const [deployerAddr, ownerAddr] = await Promise.all([
      deployerSign.getAddress(),
      ownerSign.getAddress(),
    ]);

    const bondModel = (await deployContract(deployerSign, BondModelMockArtifact, [])) as BondModelMock;
    const underlying = (await deployContract(deployerSign, Erc20MockArtifact, ['DAI MOCK', 'DAI', decimals])) as Erc20Mock;
    const cToken = (await deployContract(deployerSign, CTokenMockArtifact, [underlying.address])) as CTokenMock;
    const pool = (await deployContract(deployerSign, SmartYieldPoolCompoundMockArtifact, ['bbDAI', 'bbDAI MOCK'])) as SmartYieldPoolCompoundMock;
    const oracle = (await deployContract(deployerSign, YieldOracleMockArtifact, [])) as YieldOracleMock;
    const bondToken = (await deployContract(deployerSign, BondTokenMockArtifact, ['BOND', 'BOND MOCK', pool.address])) as BondTokenMock;
    await pool.setup(oracle.address, bondModel.address, bondToken.address, cToken.address, );

    await (moveTime(pool))(0);

    return {
      oracle, pool, cToken, bondModel, bondToken, underlying,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      deployerAddr, ownerAddr,
      moveTime: moveTime(pool),
    };
  };
};

describe('buyBond()', async function () {
  it('should deploy contracts corectly', async function () {
    const decimals = 18;
    const { pool, oracle, bondModel, cToken, underlying, bondToken } = await bbFixtures(fixture(18));

    expect(await pool.oracle()).equals(oracle.address, 'pool.oracle()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await pool.bondModel()).equals(bondModel.address, 'pool.bondModel()');
    expect(await pool.bondToken()).equals(bondToken.address, 'pool.bondToken()');
  });

  it('Math.compound works', async function () {
    const decimals = 18;
    const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
    const { pool, oracle, bondModel, cToken, underlying, bondToken } = await bbFixtures(fixture(decimals));

    await bondModel.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 1);
    expect(await bondModel.compoundingTestLast(), 'Math.compound not working (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));

    await bondModel.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 365);
    expect(await bondModel.compoundingTestLast(), 'Math.compound not working (2)').deep.equal(BN.from('89437198474492656'));
  });

  describe('buyBond() requires', async function () {
    it('Math.compound works', async function () {
      const decimals = 18;
      const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
      const { pool, oracle, bondModel, cToken, underlying, bondToken } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await pool.buyBond(e18(1), 0, 1);

      });

  });

});
