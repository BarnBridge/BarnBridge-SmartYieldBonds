import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { withCompoundRate, toWei, ERROR_MARGIN_PREFERED } from './helpers';

import { SmartYieldPool } from '../typechain/SmartYieldPool';
import { SeniorBondToken } from '../typechain/SeniorBondToken';
import { TokenPriceV1 } from '../typechain/TokenPriceV1';
import { SeniorBondSlippageV1 } from '../typechain/SeniorBondSlippageV1';

import { CTokenMock } from '../typechain/CTokenMock';
import { Erc20Mock } from '../typechain/Erc20Mock';

import SmartYieldPoolArtefact from '../artifacts/contracts/SmartYieldPool.sol/SmartYieldPool.json';
import SeniorBondTokenArtefact from '../artifacts/contracts/SeniorBondToken.sol/SeniorBondToken.json';
import TokenPriceV1Artefact from '../artifacts/contracts/Model/Token/TokenPriceV1.sol/TokenPriceV1.json';
import SeniorBondSlippageV1Artefact from '../artifacts/contracts/Model/Bond/SeniorBondSlippageV1.sol/SeniorBondSlippageV1.json';

import CTokenMockArtefact from '../artifacts/contracts/mocks/CTokenMock.sol/CTokenMock.json';
import Erc20MockArtefact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';


describe('Senior Bond Rates', function () {

  let deployerSign: Signer, ownerSign: Signer, junior1Sign: Signer, junior2Sign: Signer, senior1Sign: Signer, senior2Sign: Signer;
  let deployerAddr: string, ownerAddr: string, junior1Addr: string, junior2Addr: string, senior1Addr: string, senior2Addr: string;

  let juniorModel: TokenPriceV1;
  let seniorModel: SeniorBondSlippageV1;

  let ctoken: CTokenMock, rewardCtoken: Erc20Mock, juniorToken: Erc20Mock, seniorToken: SeniorBondToken, underliying: Erc20Mock;
  let pool: SmartYieldPool;
  let snapshotId: any;


  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', []);

    [deployerSign, ownerSign, junior1Sign, junior2Sign, senior1Sign, senior2Sign] = await ethers.getSigners();
    [deployerAddr, ownerAddr, junior1Addr, junior2Addr, senior1Addr, senior2Addr] = await Promise.all([
      deployerSign.getAddress(),
      ownerSign.getAddress(),
      junior1Sign.getAddress(),
      junior2Sign.getAddress(),
      senior1Sign.getAddress(),
      senior2Sign.getAddress(),
    ]);

    afterEach(async function () {
      await ethers.provider.send('evm_revert', [snapshotId]);
    });

    rewardCtoken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['COMP', 'COMP'])) as Erc20Mock;
    underliying = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['DAI', 'DAI'])) as Erc20Mock;
    ctoken = (await deployContract(<Wallet>deployerSign, CTokenMockArtefact, [underliying.address])) as CTokenMock;

    juniorModel = (await deployContract(deployerSign, TokenPriceV1Artefact, [])) as TokenPriceV1;
    seniorModel = (await deployContract(deployerSign, SeniorBondSlippageV1Artefact, [])) as SeniorBondSlippageV1;

    pool = (await deployContract(<Wallet>deployerSign, SmartYieldPoolArtefact, [ctoken.address, rewardCtoken.address, juniorModel.address, seniorModel.address])) as SmartYieldPool;

    juniorToken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['jBOND', 'jBOND'])) as Erc20Mock;
    seniorToken = (await deployContract(<Wallet>deployerSign, SeniorBondTokenArtefact, ['sBOND', 'sBOND', pool.address])) as SeniorBondToken;

    await pool.setup(seniorToken.address, juniorToken.address);
  });

  it('should compute compounding rates the way compound.finance does', async function () {

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
