// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, A_DAY, BLOCKS_PER_DAY, deployBondModel, deploySmartYieldMock, deployYieldOracle, buyTokens, buyBond, redeemBond, deployCTokenWorldMock, deployCompoundProvider, deployCompoundControllerMock, deploySeniorBond, deployJuniorBond, buyJuniorBond, redeemJuniorBond, sellTokens, forceTime, forceNextTime, dailyRate2APY, e6 } from '@testhelp/index';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';

const decimals = 18;
const supplyRatePerBlock = BN.from('29081372534'); // apy 6.3%
const exchangeRateStored = BN.from('211947423095304110328209229');

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
      sellTokens: sellTokens(smartYield, pool),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      buyJuniorBond: buyJuniorBond(smartYield, pool),
      redeemJuniorBond: redeemJuniorBond(smartYield),
    };
  };
};

describe('tokens: buyTokens()', async function () {
  it('should deploy contracts correctly', async function () {
    const { smartYield, pool, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(ctokenWorld.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await smartYield.juniorBond()).equals(juniorBond.address, 'smartYield.juniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    expect(await oracle.cumulator()).equals(controller.address, 'oracle.pool()');
  });

  describe('instant withdraw', async function () {
    it('if there\'s debt, it is forfeit', async function () {

      const { smartYield, pool, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, sellTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));
      const tokensBefore = await smartYield.balanceOf(junior1.address);

      await forceNextTime(A_DAY * 3);

      await buyBond(senior1, e18(1000), 0, 30);
      await forceTime(A_DAY * 20);

      await forceNextTime(2);

      const underlyingBefore = (await smartYield.callStatic.price()).mul(tokensBefore).div(e18(1));
      const underlyingDebt = (await smartYield.abondDebt());
      await sellTokens(junior1, tokensBefore);
      const underlyingGot = (await underlying.balanceOf(junior1.address));

      // div(e6(1)) round down due to precision loss
      expect(underlyingBefore.sub(underlyingGot).div(e6(1)), 'user got too much').equal(underlyingDebt.div(e6(1)));
      expect(await smartYield.callStatic.price(), 'price should be 1 (1)').deep.equal(e18(1));
      await forceTime(A_DAY * 20);

      expect(await smartYield.callStatic.price(), 'price should be 1 (2)').deep.equal(e18(1));
      expect(await smartYield.abondDebt(), 'debt should be 0').deep.equal(e18(0));
    });

    it('if there\'s debt, it is forfeit with multiple juniors', async function () {

      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, sellTokens, buyBond, junior1, junior2, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));
      const tokensBefore1 = await smartYield.balanceOf(junior1.address);

      await buyTokens(junior2, e18(900));
      const tokensBefore2 = await smartYield.balanceOf(junior2.address);

      await forceTime(A_DAY * 3);

      await buyBond(senior1, e18(1000), 0, 30);
      await forceTime(A_DAY * 20);

      const underlyingBefore1 = (await smartYield.callStatic.price()).mul(tokensBefore1).div(e18(1));
      const underlyingDebt = (await smartYield.abondDebt());
      await sellTokens(junior1, tokensBefore1);
      const underlyingGot1 = (await underlying.balanceOf(junior1.address));

      expect(underlyingBefore1.sub(underlyingGot1).lte(underlyingDebt.mul(100).div(1000).sub(1)), 'user got too much').equal(true);

    });
  });

  describe('buyTokens', async function () {
    it('junior gets tokens', async function () {

      const { smartYield, oracle, bondModel, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      const tokensBefore = await smartYield.balanceOf(junior1.address);
      await buyTokens(junior1, e18(100));
      const tokensAfter = await smartYield.balanceOf(junior1.address);
      expect(tokensBefore, 'balance before should be 0').equal(0);
      expect(tokensAfter, 'balance after should be 100').deep.equal(e18(100));
    });
  });

  describe('price', async function () {

    it('yield decreases after buyBond, price goes down', async function () {

      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      const priceBefore = await smartYield.callStatic.price();
      await buyTokens(junior1, e18(100));

      await forceTime(A_DAY * 3);
      await buyBond(senior1, e18(1000), 0, 30);

      await ctokenWorld.setSupplyRatePerBlock(0);

      await forceTime(A_DAY * 10);

      const priceNow = await smartYield.callStatic.price();

      expect(priceNow.lt(priceBefore), 'price now not lower (1)').equal(true);

      await forceTime(A_DAY * 20);

      const priceNow2 = await smartYield.callStatic.price();

      expect(priceNow2.lt(priceNow), 'price now not even lower (2)').equal(true);
    });

    it('yield increases after buyBond, price goes up', async function () {
      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await ctokenWorld.setSupplyRatePerBlock(supplyRatePerBlock);

      const priceBefore = await smartYield.callStatic.price();
      await buyTokens(junior1, e18(100));

      await forceTime(A_DAY * 3);

      await buyBond(senior1, e18(1000), 0, 30);

      const abond = await smartYield.callStatic.abond();

      await ctokenWorld.setSupplyRatePerBlock(supplyRatePerBlock);

      await forceTime(A_DAY * 362);

      const priceNow = await smartYield.callStatic.price();

      expect(priceNow.gt(priceBefore), 'price now not greater (1)').equal(true);

      await forceTime(A_DAY * 20);

      const priceNow2 = await smartYield.callStatic.price();

      expect(priceNow2.gt(priceNow), 'price now not even greater (2)').equal(true);
    });

    it('price doesn\'t change before and after buyTokens', async function () {

      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await ctokenWorld.setSupplyRatePerBlock(0);

      await buyTokens(junior1, e18(100));

      await forceTime(4 * A_DAY);
      await forceNextTime(1);

      const priceBefore = await smartYield.callStatic.price();
      await buyTokens(junior1, e18(100));
      // div(e6(1)) round down due to precision loss
      expect((await smartYield.callStatic.price()).div(e6(1)), 'price changed').deep.equal(priceBefore.div(e6(1)));
    });

    it('price doesn\'t change before and after buyBond', async function () {

      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(100));

      await forceTime(4 * A_DAY);

      const priceBefore = await smartYield.callStatic.price();
      await buyBond(senior1, e18(1000), 0, 30);
      // div(e6(1)) round down due to precision loss
      expect((await smartYield.callStatic.price()).div(e6(1)), 'price changed').deep.equal(priceBefore.div(e6(1)).sub(1));
    });

    it('with no yield price stays the same', async function () {

      const { smartYield, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, juniorBond, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await ctokenWorld.setSupplyRatePerBlock(0);
      await controller.setProviderRatePerDay(true, 0);

      const priceBefore = await smartYield.callStatic.price();
      await buyTokens(junior1, e18(100));

      await forceTime(4 * A_DAY);
      // div(e6(1)) round down due to precision loss
      expect((await smartYield.callStatic.price()).div(e6(1)), 'price changed (1)').deep.equal(priceBefore.div(e6(1)).sub(1));
      await buyTokens(junior1, e18(1000));
      // div(e6(1)) round down due to precision loss
      expect((await smartYield.callStatic.price()).div(e6(1)), 'price changed (2)').deep.equal(priceBefore.div(e6(1)).sub(1));
    });


  });

});
