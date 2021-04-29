// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, HT, toBNj, deployUnderlying, deployYieldOracleMock, deployCompoundController, deploySmartYieldMock, deploySeniorBondMock, deployJuniorBondMock, deployBondModel } from '@testhelp/index';

const decimals = 18;
const supplyRatePerBlock = BN.from('17887002461'); // 3.83% // 89437198474492656
const exchangeRateStored = BN.from('209925401370684257147228884');

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;


    const [bondModel] = await Promise.all([
      deployBondModel(deployerSign),
    ]);

    return {
      bondModel,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
    };
  };
};

describe('BondModel bond rate computations', async function () {

  describe('bondModel.maxDailyRate()', async function () {
    it('expected values', async function () {
      const { bondModel, deployerSign, ownerSign } = await bbFixtures(fixture(decimals));

      expect(await bondModel.callStatic.maxDailyRate(e18(1000), e18(1000), supplyRatePerBlock.mul(BLOCKS_PER_DAY)), 'maxDailyRate is correct (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      expect(await bondModel.callStatic.maxDailyRate(e18(1000), e18(500), supplyRatePerBlock.mul(BLOCKS_PER_DAY)), 'maxDailyRate is correct (2)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY).mul(50).div(100));

      expect(await bondModel.callStatic.maxDailyRate(0, e18(500), supplyRatePerBlock.mul(BLOCKS_PER_DAY)), 'maxDailyRate is 0').deep.equal(BN.from(0));
    });
  });

  describe('bondModel.gain()', async function () {
    it('expected values', async function () {
      const { bondModel, } = await bbFixtures(fixture(decimals));

      let underlyingLoanable = e18(1000);
      let underlyingTotal = e18(1000);
      let principal = e18(100);
      let gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (1)').deep.equal(BN.from('3465336790874529321'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(400);
      gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (2)').deep.equal(BN.from('10014927776178109680'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1000);
      gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (3)').deep.equal(BN.from('14721619513810555552'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (4)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(100000000);
      gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (4)').deep.equal(BN.from('35169944167142674007'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (5)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(9000);
      gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (5)').deep.equal(BN.from('3169649973341740'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (6)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1);
      gain = await bondModel.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (6)').deep.equal(BN.from('352183326719'));

      gain = await bondModel.gain(0, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be 0').deep.equal(BN.from(0));
    });

  });


});
