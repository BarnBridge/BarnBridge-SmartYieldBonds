// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, HT, toBNj } from '@testhelp/index';

import BondModelV1Artifact from '../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import SeniorBondArtifact from '../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
import JuniorBondArtifact from '../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
import Erc20MockArtifact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import CTokenMockArtifact from '../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import SYPCompForModelMockArtifact from '../artifacts/contracts/mocks/barnbridge/SYPCompForModelMock.sol/SYPCompForModelMock.json';
import YieldOracleMockArtifact from '../artifacts/contracts/mocks/barnbridge/YieldOracleMock.sol/YieldOracleMock.json';
import ComptrollerMockArtifact from '../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
import JuniorTokenArtifact from '../artifacts/contracts/JuniorToken.sol/JuniorToken.json';
import ControllerCompoundArtifact from './../artifacts/contracts/ControllerCompound.sol/ControllerCompound.json';

import { YieldOracleMock } from '@typechain/YieldOracleMock';
import { SypCompForModelMock } from '@typechain/SYPCompForModelMock';
import { BondModelV1 } from '@typechain/BondModelV1';
import { SeniorBond } from '@typechain/SeniorBond';
import { JuniorBond } from '@typechain/JuniorBond';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { CTokenMock } from '@typechain/CTokenMock';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';
import { ComptrollerMock } from '@typechain/ComptrollerMock';
import { JuniorToken} from '@typechain/JuniorToken';
import { ControllerCompound } from '@typechain/ControllerCompound';

const START_TIME = 1614556800; // 03/01/2021 @ 12:00am (UTC)
let timePrev = BN.from(START_TIME);

const decimals = 18;
const supplyRatePerBlock = BN.from('17887002461'); // 3.83% // 89437198474492656
const exchangeRateStored = BN.from('209925401370684257147228884');

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
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const bondModel = (await deployContract(deployerSign, BondModelV1Artifact, [])) as BondModelV1;
    const underlying = (await deployContract(deployerSign, Erc20MockArtifact, ['DAI MOCK', 'DAI', decimals])) as Erc20Mock;
    const comptroller = (await deployContract(deployerSign, ComptrollerMockArtifact, [])) as ComptrollerMock;
    const cToken = (await deployContract(deployerSign, CTokenMockArtifact, [underlying.address, comptroller.address])) as CTokenMock;
    const pool = (await deployContract(deployerSign, SYPCompForModelMockArtifact, [])) as SypCompForModelMock;
    const oracle = (await deployContract(deployerSign, YieldOracleMockArtifact, [pool.address])) as YieldOracleMock;
    const seniorBond = (await deployContract(deployerSign, SeniorBondArtifact, ['BOND', 'BOND MOCK', pool.address])) as SeniorBond;
    const juniorBond = (await deployContract(deployerSign, JuniorBondArtifact, ['jBOND', 'jBOND MOCK', pool.address])) as JuniorBond;
    const juniorToken = (await deployContract(deployerSign, JuniorTokenArtifact, ['jTOKEN MOCK', 'bbDAI', pool.address])) as JuniorToken;
    const controller = (await deployContract(deployerSign, ControllerCompoundArtifact, [])) as ControllerCompound;

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setBondModel(bondModel.address),
      comptroller.setHolder(pool.address),
      comptroller.setMarket(cToken.address),
      pool.setup(controller.address, seniorBond.address, juniorBond.address, juniorToken.address, cToken.address),
    ]);

    timePrev = BN.from(START_TIME);
    await (moveTime(pool))(0);

    return {
      oracle, pool, cToken, bondModel, seniorBond, underlying, controller,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(pool),
    };
  };
};

describe('BondModel bond rate computations', async function () {

  it('should deploy contracts correctly', async function () {
    const decimals = 18;
    const { pool, oracle, bondModel, cToken, underlying, seniorBond, controller } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await pool.seniorBond()).equals(seniorBond.address, 'pool.seniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
  });

  describe('bondModel.gain()', async function () {
    it('expected values', async function () {
      const { pool, oracle, bondModel, cToken, underlying, moveTime, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      let underlyingLoanable = e18(1000);
      expect(underlyingLoanable.gte(0), 'no liquidity (1)');
      let underlyingTotal = e18(1000);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      let principal = e18(100);
      let gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (1)').deep.equal(BN.from('3465336790874529321'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (2)');
      underlyingTotal = underlyingTotal.add(principal);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(400);
      gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (2)').deep.equal(BN.from('10014927776178109680'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (3)');
      underlyingTotal = underlyingTotal.add(principal);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(1000);
      gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (3)').deep.equal(BN.from('14721619513810555552'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (4)');
      underlyingTotal = underlyingTotal.add(principal);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(100000000);
      gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (4)').deep.equal(BN.from('35169944167142674007'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (5)');
      underlyingTotal = underlyingTotal.add(principal);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(9000);
      gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (5)').deep.equal(BN.from('3169649973341740'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (6)');
      underlyingTotal = underlyingTotal.add(principal);
      await pool.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(1);
      gain = await bondModel.gain(pool.address, principal, 365);
      expect(gain, 'gain should be correct (6)').deep.equal(BN.from('352183326719'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);
    });

  });


});
