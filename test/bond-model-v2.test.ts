// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, HT, toBNj, deployUnderlying, deployYieldOracleMock, deployCompoundController, deploySmartYieldMock, deploySeniorBondMock, deployJuniorBondMock, deployBondModel, deployBondModelV2Linear, deployBondModelV2Compounded } from '@testhelp/index';

const decimals = 18;
const supplyRatePerBlock = BN.from('17887002461'); // 3.83% // 89437198474492656
const exchangeRateStored = BN.from('209925401370684257147228884');

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;


    const [bondModelV2Linear, bondModelV2Compounded] = await Promise.all([
      deployBondModelV2Linear(deployerSign),
      deployBondModelV2Compounded(deployerSign),
    ]);

    return {
      bondModelV2Linear,
      bondModelV2Compounded,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
    };
  };
};

describe('BondModel v2', async function () {

  describe('bondModel MAX_POOL_RATIO', async function () {
    it('setting it works', async function () {
      const { bondModelV2Linear, deployerSign, ownerSign } = await bbFixtures(fixture(decimals));

      const deployedMaxPoolRatio = await bondModelV2Linear.callStatic.MAX_POOL_RATIO();

      expect(deployedMaxPoolRatio, 'deployed MAX_POOL_RATIO is correct').deep.equal(e(750, 15));

      await bondModelV2Linear.connect(deployerSign).setMaxPoolRation(e(500, 15));

      expect(await bondModelV2Linear.callStatic.MAX_POOL_RATIO(), 'changed MAX_POOL_RATIO is correct').deep.equal(e(500, 15));

      await expect(bondModelV2Linear.connect(ownerSign).setMaxPoolRation(e(100, 15)), 'if not DAO it reverts').revertedWith('GOV: not dao');
    });
  });

  describe('bondModel.maxDailyRate()', async function () {
    it('expected values', async function () {
      const { bondModelV2Linear, deployerSign, ownerSign } = await bbFixtures(fixture(decimals));

      await bondModelV2Linear.connect(deployerSign).setMaxPoolRation(e(750, 15));

      expect(await bondModelV2Linear.callStatic.maxDailyRate(e18(1000), e18(1000), supplyRatePerBlock.mul(BLOCKS_PER_DAY)), 'maxDailyRate is correct (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY).mul(75).div(100));

      expect(await bondModelV2Linear.callStatic.maxDailyRate(e18(1000), e18(500), supplyRatePerBlock.mul(BLOCKS_PER_DAY)), 'maxDailyRate is correct (2)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY).mul(50).div(100));
    });
  });

  describe('bondModel.gain() linear', async function () {
    it('expected values', async function () {
      const { bondModelV2Linear, deployerSign } = await bbFixtures(fixture(decimals));

      await bondModelV2Linear.connect(deployerSign).setMaxPoolRation(e(750, 15));

      let underlyingLoanable = e18(1000);
      let underlyingTotal = e18(1000);
      let principal = e18(100);
      let gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (1)').deep.equal(BN.from('2820422548050480000'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(400);
      gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (2)').deep.equal(BN.from('9899604844378434000'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1000);
      gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (3)').deep.equal(BN.from('14627524471722685000'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (4)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(100000000);
      gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (4)').deep.equal(BN.from('35200857069500000000'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (5)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(9000);
      gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (5)').deep.equal(BN.from('3172435956765000'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (6)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1);
      gain = await bondModelV2Linear.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (6)').deep.equal(BN.from('352492880435'));
    });

  });

  describe('bondModel.gain() compounded', async function () {
    it('expected values', async function () {
      const { bondModelV2Compounded, deployerSign } = await bbFixtures(fixture(decimals));

      await bondModelV2Compounded.connect(deployerSign).setMaxPoolRation(e(750, 15));

      let underlyingLoanable = e18(1000);
      let underlyingTotal = e18(1000);
      let principal = e18(100);
      let gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (1)').deep.equal(BN.from('2860460966231169533'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(400);
      gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (2)').deep.equal(BN.from('10021081148371675269'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1000);
      gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (3)').deep.equal(BN.from('14730618396138855595'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (4)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(100000000);
      gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (4)').deep.equal(BN.from('35191286600064420811'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (5)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(9000);
      gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (5)').deep.equal(BN.from('3171573436730569'));

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (6)');
      underlyingTotal = underlyingTotal.add(principal);
      principal = e18(1);
      gain = await bondModelV2Compounded.gain(underlyingTotal, underlyingLoanable, supplyRatePerBlock.mul(BLOCKS_PER_DAY), principal, 365);
      expect(gain, 'gain should be correct (6)').deep.equal(BN.from('352397044873'));
    });

  });

});
