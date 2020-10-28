import { expect, Assertion } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { SmartYieldPool } from '../typechain/SmartYieldPool';
import { CTokenMock } from '../typechain/CTokenMock';
import { Erc20Mock } from '../typechain/Erc20Mock';
import { SeniorBondToken } from '../typechain/SeniorBondToken';

import SmartYieldPoolArtefact from '../artifacts/contracts/SmartYieldPool.sol/SmartYieldPool.json';
import SeniorBondTokenArtefact from '../artifacts/contracts/SeniorBondToken.sol/SeniorBondToken.json';

import CTokenMockArtefact from '../artifacts/contracts/mocks/CTokenMock.sol/CTokenMock.json';
import Erc20MockArtefact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { withCompoundRate } from './helpers/rates';
import { toWei } from './helpers/misc';

Assertion.addMethod('equalWithin', function (toCheck: BNj, within: BNj) {
  new Assertion(this._obj).to.be.instanceof(BN);

  const obj = new BNj((this._obj as BN).toString());
  const errorMargin = (obj.gt(toCheck) ? obj.minus(toCheck) : toCheck.minus(obj)).div(toCheck);

  this.assert(
    errorMargin.abs().lt(within)
    , `expected #{this} to be within #{exp} but got withing #{act} (v=${toCheck.toString()})`
    , `expected #{this} to not be within #{exp} but got withing #{act} (v=${toCheck.toString()})`
    , within.toString()        // expected
    , errorMargin.abs().toString()   // actual
  );
});

declare global {
  export namespace Chai {
    interface Assertion {
      equalWithin(toCheck: BNj, within: BNj): Promise<void>;
    }
  }
}


describe('Senior Bond Rates', function () {
  const OK_ERROR_MARGIN = new BNj(1).div(new BNj(10).pow(10)); // 0.0000001 %

  let deployerSign: Signer, ownerSign: Signer, junior1Sign: Signer, junior2Sign: Signer, senior1Sign: Signer, senior2Sign: Signer;
  let deployerAddr: string, ownerAddr: string, junior1Addr: string, junior2Addr: string, senior1Addr: string, senior2Addr: string;
  let ctoken: CTokenMock, rewardCtoken: Erc20Mock, juniorToken: Erc20Mock, seniorToken: SeniorBondToken, pool: SmartYieldPool, underliying: Erc20Mock;
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

    ctoken = (await deployContract(<Wallet>deployerSign, CTokenMockArtefact, [])) as CTokenMock;
    rewardCtoken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['COMP', 'COMP'])) as Erc20Mock;
    underliying = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['DAI', 'DAI'])) as Erc20Mock;

    pool = (await deployContract(<Wallet>deployerSign, SmartYieldPoolArtefact, [ctoken.address, rewardCtoken.address])) as SmartYieldPool;

    juniorToken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['jBOND', 'jBOND'])) as Erc20Mock;
    seniorToken = (await deployContract(<Wallet>deployerSign, SeniorBondTokenArtefact, ['sBOND', 'sBOND', pool.address])) as SeniorBondToken;

    await pool.setup(seniorToken.address, juniorToken.address);
  });

  it('should compute compounding rates the way compound.finance does', async function () {

    const BLOCKS_PER_EPOCH = await pool.BLOCKS_PER_EPOCH();

    for (let n = 1; n < 366; n++) {
      const ratePerEpoch = new BNj(BLOCKS_PER_EPOCH.mul(13504323262).toString()).div(new BNj(10).pow(18)); // 13504323262
      const principal = new BNj(0.11);
      //const n = 365; // compounding intervals

      const okPrincipal = withCompoundRate(principal, ratePerEpoch, n);
      const testPrincipal = await pool.compound(toWei(principal), toWei(ratePerEpoch), BN.from(n));

      expect(testPrincipal).to.equalWithin(okPrincipal.times(new BNj(10).pow(18)), OK_ERROR_MARGIN);
    }

  });
});
