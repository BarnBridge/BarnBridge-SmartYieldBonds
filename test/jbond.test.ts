// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, buyTokens, sellTokens, buyBond, redeemBond, deployBondModel, deployUnderlying, deployCompComptroller, deployYieldOracleMock, deployCompoundController, deployCompoundProvider, deploySmartYield, deployCompCToken, deploySeniorBond, deployJuniorBond, moveTime, deployYieldOracle, deployClockMock, currentTime, deployCompCTokenYielding, buyJuniorBond, redeemJuniorBond } from '@testhelp/index';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const clock = await deployClockMock(deployerSign);

    const [bondModel, underlying, comptroller, controller, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployUnderlying(deployerSign, decimals),
      deployCompComptroller(deployerSign),
      deployCompoundController(deployerSign),
      deployCompoundProvider(deployerSign, clock),
      deploySmartYield(deployerSign, clock),
    ]);

    const [oracle, cToken, seniorBond, juniorBond] = await Promise.all([
      deployYieldOracle(deployerSign, pool, 4 * A_DAY, 4),
      deployCompCTokenYielding(deployerSign, underlying, comptroller, clock, exchangeRateStored),
      deploySeniorBond(deployerSign, smartYield),
      deployJuniorBond(deployerSign, smartYield),
    ]);

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setBondModel(bondModel.address),
      comptroller.setHolder(smartYield.address),
      comptroller.setMarket(cToken.address),
      pool.setup(smartYield.address, controller.address, cToken.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY)),
      controller.setFeeBuyJuniorToken(e18(0).div(100)),
      (moveTime(clock))(0),
    ]);

    return {
      oracle, pool, smartYield, cToken, bondModel, seniorBond, juniorBond, underlying, controller,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(smartYield, pool, underlying),
      sellTokens: sellTokens(smartYield, pool),
      buyJuniorBond: buyJuniorBond(smartYield, pool),
      redeemJuniorBond: redeemJuniorBond(smartYield),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      moveTime: moveTime(clock),
    };
  };
};

describe('junior bonds: buyJuniorBond()', async function () {
  it('should deploy contracts correctly', async function () {
    const { pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond } = await bbFixtures(fixture(decimals));

    // expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    // expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    // expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    // expect(await pool.seniorBond()).equals(seniorBond.address, 'pool.seniorBond()');
    // expect(await pool.juniorBond()).equals(juniorBond.address, 'pool.juniorBond()');
    // expect(await pool.juniorToken()).equals(juniorToken.address, 'pool.juniorToken()');
    // expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    // expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    // expect(await oracle.pool()).equals(pool.address, 'oracle.pool()');
  });

  describe('purchase junior bonds', async function () {

    it('liquidation works', async function () {
      const { pool, smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1, senior2 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(101));
      await buyTokens(junior3, e18(101));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(100), 0, 30);
      await moveTime(A_DAY * 1);

      await buyBond(senior2, e18(100), 0, 30);
      await moveTime(A_DAY * 1);

      await buyJuniorBond(junior1, e18(100), currentTime().add(1000 * A_DAY));
      await buyJuniorBond(junior2, e18(100), currentTime().add(1000 * A_DAY));

      let tokensInJuniorBonds = await smartYield.tokensInJuniorBonds();
      console.log('tokensInJuniorBonds >>> ', tokensInJuniorBonds.toString());
      expect(tokensInJuniorBonds, 'tokensInJuniorBonds should be 200').deep.equal(e18(200));
      await moveTime(A_DAY * 25 + 1);

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'x oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(100), 0, 1);

      tokensInJuniorBonds = await smartYield.tokensInJuniorBonds();
      const underlyingLiquidatedJuniors = await smartYield.underlyingLiquidatedJuniors();
      console.log('tokensInJuniorBonds         >>> ', tokensInJuniorBonds.toString());
      expect(tokensInJuniorBonds, 'tokensInJuniorBonds should be 200').deep.equal(e18(0));
      console.log('underlyingLiquidatedJuniors >>> ', underlyingLiquidatedJuniors.toString());
      const price = await smartYield.price();
      //expect(storage.underlyingLiquidatedJuniors, 'storage.underlyingLiquidatedJuniors').deep.equal(price.mul(e18(200)).div(e18(1)));
      expect(underlyingLiquidatedJuniors.gt(0), 'underlyingLiquidatedJuniors').equal(true);

      await redeemJuniorBond(junior1, 1);
      const underlyingGot1 = await underlying.balanceOf(junior1.address);

      await moveTime(A_DAY * 100);

      await redeemJuniorBond(junior2, 2);
      const underlyingGot2 = await underlying.balanceOf(junior2.address);

      expect(underlyingGot1, 'both juniors get the same amount').deep.equal(underlyingGot2);
    }).timeout(100 * 1000);

    it('junior bond redeem', async function () {

      const { pool, smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(100), currentTime().add(20 * A_DAY).add(1));
      await moveTime(1 + A_DAY * 20);

      const expectedUnderlying = (await smartYield.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(await underlying.balanceOf(junior1.address), 'should receive correct amount').deep.equal(expectedUnderlying);
      await expect(redeemJuniorBond(senior1, 1), 'already redeemed should revert').revertedWith('ERC721: owner query for nonexistent token');
      await expect(redeemJuniorBond(senior1, 10000), 'redeemed should revert for unexisting jBonds').revertedWith('ERC721: owner query for nonexistent token');
    });

    it('redeemJuniorBond() can return less than sellToken() extreme conditions', async function () {

      const { smartYield, pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, buyJuniorBond, redeemJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      await buyTokens(junior2, e18(100));
      await buyTokens(junior3, e18(100));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(100), 0, 30);
      await moveTime(A_DAY * 1);


      const potentialSellUnderlying = (await smartYield.price()).mul(e18(100)).sub((await smartYield.abondDebt()).mul(e18(1)).div(3)).div(e18(1));
      await buyJuniorBond(junior1, e18(100), currentTime().add(100 * A_DAY).add(1));

      await cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY * 5));

      for (let i = 0; i < 4; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }

      await buyBond(senior1, e18(1000), 0, 90);

      await cToken.setYieldPerDay(0);

      await moveTime(A_DAY * 25 + 1);

      const expectedUnderlying = (await smartYield.price()).mul(e18(100)).div(e18(1));
      await redeemJuniorBond(senior1, 1);

      expect(expectedUnderlying.sub(potentialSellUnderlying).lt(0), 'expectedUnderlying is larger').equal(true);

    }).timeout(100 * 1000);

    it('junior gets jbond', async function () {

      const { pool, smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, buyJuniorBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 10);

      expect(await juniorBond.balanceOf(junior1.address), 'bond onwer should have 0 bond').deep.equal(BN.from(0));

      await buyJuniorBond(junior1, e18(10), currentTime().add(20 * A_DAY).add(1));

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

      const { pool, smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, buyJuniorBond, junior1, junior2, junior3, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(1000));
      await buyTokens(junior2, e18(1000));
      await buyTokens(junior3, e18(1000));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
      }
      await buyBond(senior1, e18(1000), 0, 90);
      await moveTime(A_DAY * 1);

      const expected = [];

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior1, e18(10), currentTime().add(100 * A_DAY));
      await moveTime(A_DAY);

      await buyBond(senior1, e18(1000), 0, 70);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 60);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 50);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 40);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
      await buyBond(senior1, e18(1000), 0, 30);

      expected.push((await smartYield.abond()).maturesAt.div(e18(1)).add(1));
      await buyJuniorBond(junior2, e18(10), currentTime().add(100 * A_DAY));
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
