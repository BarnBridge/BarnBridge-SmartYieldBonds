// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, A_DAY, BLOCKS_PER_DAY, buyTokens, buyBond, redeemBond, buyJuniorBond, redeemJuniorBond, deployBondModel, deployYieldOracle, currentTime, deployCTokenWorldMock, deploySmartYield, deployCompoundProvider, deployCompoundControllerMock, deploySeniorBond, deployJuniorBond, A_HOUR, forceTime, TIME_IN_FUTURE, deploySmartYieldMock } from '@testhelp/index';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

const oracleCONF = { windowSize: 4 * A_DAY, granularity: 4 };

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const [ctokenWorld] = await Promise.all([
      deployCTokenWorldMock(deployerSign, exchangeRateStored, supplyRatePerBlock, 0, decimals),
    ]);

    const underlying = Erc20MockFactory.connect(await ctokenWorld.callStatic.underlying(), deployerSign);
    const comp = Erc20MockFactory.connect(await ctokenWorld.callStatic.getCompAddress(), deployerSign);
    const compOracle = CompOracleMockFactory.connect(await ctokenWorld.callStatic.oracle(), deployerSign);

    const [smartYield, pool, bondModel] = await Promise.all([
      deploySmartYieldMock(deployerSign, decimals),
      deployCompoundProvider(deployerSign, ctokenWorld.address),
      deployBondModel(deployerSign),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployCompoundControllerMock(deployerSign, pool.address, smartYield.address, bondModel.address, [comp.address, underlying.address]),
      deploySeniorBond(deployerSign, smartYield.address, 'sBOND', 'sBOND'),
      deployJuniorBond(deployerSign, smartYield.address, 'jBOND', 'jBOND'),
    ]);

    const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

    await Promise.all([
      controller.setOracle(oracle.address),
      pool.setup(smartYield.address, controller.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      controller.setFeeBuyJuniorToken(0),
    ]);

    return {
      controller, smartYield, pool, bondModel, oracle, juniorBond, seniorBond, underlying, comp, compOracle, ctokenWorld,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      buyJuniorBond: buyJuniorBond(smartYield, pool),
      redeemJuniorBond: redeemJuniorBond(smartYield),
    };
  };
};

describe('junior bonds: buyJuniorBond()', async function () {
  describe('purchase junior bonds', async function () {

    it('barnbridge oz c01 example test', async function () {
      const { pool, smartYield, oracle, bondModel, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1, senior2 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(1000));
      await buyTokens(junior2, e18(1500));
      await buyTokens(junior3, e18(2500));

      await forceTime(A_DAY * 3);

      await buyBond(senior1, e18(2000), 0, 30);
      await forceTime(A_DAY * 1);

      await buyBond(senior2, e18(2500), 0, 30);

      await buyJuniorBond(junior1, e18(1000), TIME_IN_FUTURE);
      await buyJuniorBond(junior2, e18(1500), TIME_IN_FUTURE);
      await buyJuniorBond(junior3, e18(2500), TIME_IN_FUTURE);

      expect(await smartYield.callStatic.underlyingLoanable(), 'loanable should be 0').deep.equal(BN.from(0));
    });

    it('liquidation works', async function () {
      const { pool, smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1, senior2 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(101));
      await buyTokens(junior3, e18(101));

      await forceTime(A_DAY * 4);

      await buyBond(senior1, e18(100), 0, 30);

      await forceTime(A_DAY);

      await buyBond(senior2, e18(100), 0, 30);

      await forceTime(A_DAY);

      await buyJuniorBond(junior1, e18(100), TIME_IN_FUTURE);
      await buyJuniorBond(junior2, e18(100), TIME_IN_FUTURE);

      let tokensInJuniorBonds = await smartYield.callStatic.tokensInJuniorBonds();
      expect(tokensInJuniorBonds, 'tokensInJuniorBonds should be 200').deep.equal(e18(200));
      await forceTime(A_DAY * 25 + 1);

      await forceTime(A_DAY * 4);

      await buyBond(senior1, e18(100), 0, 1);

      tokensInJuniorBonds = await smartYield.callStatic.tokensInJuniorBonds();
      const underlyingLiquidatedJuniors = await smartYield.callStatic.underlyingLiquidatedJuniors();

      expect(tokensInJuniorBonds, 'tokensInJuniorBonds should be 200').deep.equal(e18(0));

      const price = await smartYield.callStatic.price();
      //expect(storage.underlyingLiquidatedJuniors, 'storage.underlyingLiquidatedJuniors').deep.equal(price.mul(e18(200)).div(e18(1)));
      expect(underlyingLiquidatedJuniors.gt(0), 'underlyingLiquidatedJuniors').equal(true);

      await redeemJuniorBond(junior1, 1);
      const underlyingGot1 = await underlying.balanceOf(junior1.address);

      await forceTime(A_DAY * 100);

      await redeemJuniorBond(junior2, 2);
      const underlyingGot2 = await underlying.callStatic.balanceOf(junior2.address);

      expect(underlyingGot1, 'both juniors get the same amount').deep.equal(underlyingGot2);
    }).timeout(100 * 1000);

    it('junior bond redeem', async function () {
      const { pool, smartYield, oracle, bondModel, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));

      await forceTime(A_DAY * 3);

      await buyBond(senior1, e18(1000), 0, 30);
      await forceTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(100), TIME_IN_FUTURE);
      await forceTime(1 + A_DAY * 20);

      const expectedUnderlying = (await smartYield.callStatic.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(await underlying.balanceOf(junior1.address), 'should receive correct amount').deep.equal(expectedUnderlying);
      await expect(redeemJuniorBond(senior1, 1), 'already redeemed should revert').revertedWith('ERC721: owner query for nonexistent token');
      await expect(redeemJuniorBond(senior1, 10000), 'redeemed should revert for unexisting jBonds').revertedWith('ERC721: owner query for nonexistent token');
    });

    it('redeemJuniorBond() can return less than sellToken() extreme conditions', async function () {
      const { smartYield, pool, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(100));
      await buyTokens(junior3, e18(100));

      await forceTime(A_DAY * 4);

      await buyBond(senior1, e18(100), 0, 30);
      await forceTime(A_DAY * 1);

      const potentialSellUnderlying = (await smartYield.callStatic.price()).mul(e18(100)).sub((await smartYield.abondDebt()).mul(e18(1)).div(3)).div(e18(1));
      await buyJuniorBond(junior1, e18(100), TIME_IN_FUTURE);

      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY * 5));

      await forceTime(A_DAY * 4);

      await buyBond(senior1, e18(1000), 0, 90);

      await ctokenWorld.setSupplyRatePerBlock(0);

      await forceTime(A_DAY * 25 + 1);

      const expectedUnderlying = (await smartYield.callStatic.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(expectedUnderlying.sub(potentialSellUnderlying).lt(0), 'expectedUnderlying is larger').equal(true);

    }).timeout(100 * 1000);

    it('junior gets jbond', async function () {
      const { pool, smartYield, oracle, bondModel, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));

      await forceTime(3 * A_DAY);

      await buyBond(senior1, e18(1000), 0, 30);
      await forceTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(10), TIME_IN_FUTURE);

      const abond = await smartYield.abond();
      const jBond = await smartYield.juniorBonds(1);

      expect(jBond.tokens, 'tokens should be correct').deep.equal(e18(10));
      expect(jBond.maturesAt, 'maturesAt should be correct').deep.equal(abond.maturesAt.div(e18(1)).add(1));
      expect(await smartYield.balanceOf(junior1.address), 'junior1 should have 90 jtokens').equal(e18(90));
      expect(await smartYield.balanceOf(smartYield.address), 'smartYield should have 10 jtokens').equal(e18(10));
      expect(await juniorBond.ownerOf(1), 'bond onwer should be correct').equal(junior1.address);
      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 1 bond').deep.equal(BN.from(1));
      expect(await juniorBond.tokenOfOwnerByIndex(junior1.address, 0), 'id of junior1\'s first bond should be #1').deep.equal(BN.from(1));
    });

    it('when buying jBonds juniorBondsMaturities is properly sorted', async function () {
      const { pool, smartYield, oracle, bondModel, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, buyJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(1000));
      await buyTokens(junior2, e18(1000));
      await buyTokens(junior3, e18(1000));

      await forceTime(3 * A_DAY);

      await buyBond(senior1, e18(1000), 0, 90);
      await forceTime(A_DAY);

      const expected = [];

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior1, e18(10), TIME_IN_FUTURE);
      await forceTime(A_DAY);

      await buyBond(senior1, e18(1000), 0, 70);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), TIME_IN_FUTURE);
      await buyBond(senior1, e18(1000), 0, 60);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), TIME_IN_FUTURE);
      await buyBond(senior1, e18(1000), 0, 50);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), TIME_IN_FUTURE);
      await buyBond(senior1, e18(1000), 0, 40);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), TIME_IN_FUTURE);
      await buyBond(senior1, e18(1000), 0, 30);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), TIME_IN_FUTURE);
      await buyBond(senior1, e18(1000), 0, 20);

      const got = (await smartYield.juniorBondsMaturitiesAll());

      expected
        .sort((a, b) => a.sub(b).toNumber())
        .map((v, i) => {
          expect(v, `item not sorted, for i=${i}`).deep.equal(got[i]);
        });

    }).timeout(100 * 1000);

  });
});
