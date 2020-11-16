import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { withCompoundRate, toWei, ERROR_MARGIN_PREFERED } from '@testhelp/index';

import { SmartYieldPool } from '@typechain/SmartYieldPool';
import { SeniorBondToken } from '@typechain/SeniorBondToken';
import { TokenPriceV1 } from '@typechain/TokenPriceV1';
import { SeniorBondSlippageV1 } from '@typechain/SeniorBondSlippageV1';

import { CTokenMock } from '@typechain/CTokenMock';
import { Erc20Mock } from '@typechain/Erc20Mock';

import SmartYieldPoolArtefact from '@artifacts/contracts/SmartYieldPool.sol/SmartYieldPool.json';
import SeniorBondTokenArtefact from '@artifacts/contracts/SeniorBondToken.sol/SeniorBondToken.json';
import TokenPriceV1Artefact from '@artifacts/contracts/Model/Token/TokenPriceV1.sol/TokenPriceV1.json';
import SeniorBondSlippageV1Artefact from '@artifacts/contracts/Model/Bond/SeniorBondSlippageV1.sol/SeniorBondSlippageV1.json';

import CTokenMockArtefact from '@artifacts/contracts/mocks/CTokenMock.sol/CTokenMock.json';
import Erc20MockArtefact from '@artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { bbFixtures } from './migrations';

const fixture = async (wallets: Wallet[]) => {
  const [deployerSign, ownerSign, junior1Sign, junior2Sign, senior1Sign, senior2Sign] = wallets;
  const [deployerAddr, ownerAddr, junior1Addr, junior2Addr, senior1Addr, senior2Addr] = await Promise.all([
    deployerSign.getAddress(),
    ownerSign.getAddress(),
    junior1Sign.getAddress(),
    junior2Sign.getAddress(),
    senior1Sign.getAddress(),
    senior2Sign.getAddress(),
  ]);

  const rewardCtoken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['COMP', 'COMP'])) as Erc20Mock;
  const underliying = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['DAI', 'DAI'])) as Erc20Mock;
  const ctoken = (await deployContract(<Wallet>deployerSign, CTokenMockArtefact, [underliying.address])) as CTokenMock;

  const juniorModel = (await deployContract(deployerSign, TokenPriceV1Artefact, [])) as TokenPriceV1;
  const seniorModel = (await deployContract(deployerSign, SeniorBondSlippageV1Artefact, [])) as SeniorBondSlippageV1;

  const pool = (await deployContract(<Wallet>deployerSign, SmartYieldPoolArtefact, [ctoken.address, rewardCtoken.address, juniorModel.address, seniorModel.address])) as SmartYieldPool;

  const juniorToken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['jBOND', 'jBOND'])) as Erc20Mock;
  const seniorToken = (await deployContract(<Wallet>deployerSign, SeniorBondTokenArtefact, ['sBOND', 'sBOND', pool.address])) as SeniorBondToken;

  await pool.setup(seniorToken.address, juniorToken.address);

  return {
    rewardCtoken, underliying, ctoken, juniorModel, seniorModel, pool, juniorToken, seniorToken,
    deployerSign: deployerSign as Signer,
    ownerSign: ownerSign as Signer,
    junior1Sign: junior1Sign as Signer,
    junior2Sign: junior2Sign as Signer,
    senior1Sign: senior1Sign as Signer,
    senior2Sign: senior2Sign as Signer,
    deployerAddr, ownerAddr, junior1Addr, junior2Addr, senior1Addr, senior2Addr,
  };
};

describe('Senior Bond Rates', function () {

  it('should compute compounding rates the way compound.finance does', async function () {
    const { pool } = await bbFixtures(fixture);

    const BLOCKS_PER_DAY = await pool.BLOCKS_PER_DAY();

    for (let n = 1; n < 366; n++) {
      const ratePerEpoch = new BNj(BLOCKS_PER_DAY.mul(13504323262).toString()).div(new BNj(10).pow(18)); // 13504323262
      const principal = new BNj(0.11);
      //const n = 365; // compounding intervals

      const okPrincipal = withCompoundRate(principal, ratePerEpoch, n);
      const testPrincipal = await pool.bondGain(toWei(principal), toWei(ratePerEpoch), BN.from(n));

      expect(testPrincipal).to.equalWithin(okPrincipal.times(new BNj(10).pow(18)), ERROR_MARGIN_PREFERED);
    }

  });

});
