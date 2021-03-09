// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, A_DAY, BLOCKS_PER_DAY, currentTime, buyTokens, buyBond, redeemBond, deployCTokenWorldMock, deploySmartYield, deployCompoundProvider, deployBondModel, deployCompoundControllerMock, deploySeniorBond, deployJuniorBond, deployYieldOracle, A_HOUR, autoMineOff, TIME_IN_FUTURE, autoMineOn, autoMineOnAddTime, forceNextTime, deployMathTests, MAX_UINT256, forceTime, e6 } from '@testhelp/index';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

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
      deploySmartYield(deployerSign, 'bbcMOCK', 'bbcMock', decimals),
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
    ]);

    return {
      controller, smartYield, pool, bondModel, oracle, juniorBond, seniorBond, underlying, comp, compOracle, ctokenWorld,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
    };
  };
};

describe('buyBond() / redeemBond()', async function () {
  it('should deploy contracts correctly', async function () {
    const decimals = 18;
    const { pool, oracle, bondModel, ctokenWorld, underlying, controller, seniorBond, smartYield } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(ctokenWorld.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
  });

  it('MathUtils.compound / MathUtils.compound2 works', async function () {
    const { deployerSign, pool, oracle, bondModel, ctokenWorld, underlying } = await bbFixtures(fixture(decimals));

    const mathTests = await deployMathTests(deployerSign as Wallet);

    await mathTests.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 1);
    expect(await mathTests.compoundingTestLast(), 'MathUtils.compound not working (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));

    await mathTests.compoundingTest(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 365);
    expect(await mathTests.compoundingTestLast(), 'MathUtils.compound not working (2)').deep.equal(BN.from('89437198474492656'));

    await mathTests.compoundingTest2(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 1);
    expect(await mathTests.compoundingTestLast(), 'MathUtils.compound not working (1)').deep.equal(supplyRatePerBlock.mul(BLOCKS_PER_DAY));

    await mathTests.compoundingTest2(e18(1), supplyRatePerBlock.mul(BLOCKS_PER_DAY), 365);
    expect(await mathTests.compoundingTestLast(), 'MathUtils.compound not working (2)').deep.equal(BN.from('89437198474492686'));

  });

  describe('buyBond()', async function () {
    it('buyBond require forDays / minGain / allowance', async function () {
      const { pool, oracle, bondModel, ctokenWorld, underlying, buyTokens, controller, junior1, smartYield, deployerSign } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(10));

      await expect(smartYield.buyBond(e18(1), 0, TIME_IN_FUTURE, 0), 'should throw for 0 days bond').revertedWith('SY: buyBond forDays');
      await expect(smartYield.buyBond(e18(1), 0, TIME_IN_FUTURE, 91), 'should throw for > BOND_MAX_LIFE days bond (1)').revertedWith('SY: buyBond forDays');
      await controller.setBondLifeMax(100);
      await expect(smartYield.buyBond(e18(1), 0, TIME_IN_FUTURE, 101), 'should throw for > BOND_MAX_LIFE days bond (2)').revertedWith('SY: buyBond forDays');
      await expect(smartYield.buyBond(e18(1), 0, TIME_IN_FUTURE, 100), 'should not throw (2)').not.revertedWith('SY: buyBond forDays');

      await expect(smartYield.buyBond(e18(1), 0, TIME_IN_FUTURE, 100), 'should throw if no allowance').revertedWith('PPC: _takeUnderlying allowance');

      const now = await currentTime();
      await expect(smartYield.buyBond(e18(1), 0, now, 10), 'should throw for deadline').revertedWith('SY: buyBond deadline');

      await underlying.mintMock(await deployerSign.getAddress(), e18(1_000_000_000));
      await underlying.connect(deployerSign).approve(pool.address, MAX_UINT256);

      const expectedGain = await smartYield.callStatic.buyBond(e18(1), 0, TIME_IN_FUTURE, 1);
      await expect(smartYield.buyBond(e18(1), expectedGain.add(1), TIME_IN_FUTURE, 1), 'should throw if gain below min').revertedWith('SY: buyBond minGain');
      await expect(smartYield.buyBond(e18(1), expectedGain, TIME_IN_FUTURE, 1), 'should not throw (1)').not.revertedWith('SY: buyBond minGain');
    });

    it('buyBond creates a correct bond token', async function () {
      const { pool, oracle, bondModel, controller, ctokenWorld, underlying, seniorBond, junior1, senior1, buyTokens, buyBond, smartYield } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await ctokenWorld.setSupplyRatePerBlock(0);

      await buyTokens(junior1, e18(10));

      await forceTime(A_DAY);

      const expectedGain = await smartYield.callStatic.bondGain(e18(1), 1);
      await buyBond(senior1, e18(1), 1, 1);

      expect(await seniorBond.callStatic.balanceOf(senior1.address), 'senior should have 1 tokens').deep.equal(BN.from(1));
      expect(await seniorBond.callStatic.tokenOfOwnerByIndex(senior1.address, 0), 'id of first token should be 1').deep.equal(BN.from(1));
      expect(await seniorBond.callStatic.ownerOf(1), 'correct owner').equal(senior1.address);

      const bondMeta = await smartYield.callStatic.seniorBonds(1);

      expect(bondMeta.principal, 'bondMeta.principal').deep.equal(e18(1));
      expect(bondMeta.gain, 'bondMeta.gain').deep.equal(expectedGain);
      expect(bondMeta.issuedAt, 'bondMeta.issuedAt').deep.equal(BN.from(await currentTime()));
      expect(bondMeta.maturesAt, 'bondMeta.maturesAt').deep.equal(BN.from(await currentTime() + A_DAY));
      expect(bondMeta.liquidated, 'bondMeta.liquidated').equal(false);
    });

    it('buyBond creates several correct bond tokens', async function () {
      const { smartYield, pool, oracle, bondModel, controller, ctokenWorld, underlying, seniorBond, junior1, senior1, senior2, buyTokens, buyBond } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await ctokenWorld.setSupplyRatePerBlock(0);

      await buyTokens(junior1, e18(10));

      await buyBond(senior1, e18(1), 1, 1); // id 1
      const issued1 = await currentTime();

      await buyBond(senior2, e18(1.1), 1, 5); // id 2
      const issued2 = await currentTime();

      await buyBond(senior1, e18(1.5), 1, 30); // id 3
      const issued3 = await currentTime();

      expect(await seniorBond.callStatic.balanceOf(senior1.address), 'senior should have 2 tokens').deep.equal(BN.from(2));
      expect(await seniorBond.callStatic.balanceOf(senior2.address), 'senior should have 1 tokens').deep.equal(BN.from(1));
      expect(await seniorBond.callStatic.tokenOfOwnerByIndex(senior1.address, 0), 'senior1 id of first token should be 1').deep.equal(BN.from(1));
      expect(await seniorBond.callStatic.tokenOfOwnerByIndex(senior1.address, 1), 'senior1 id of second token should be 3').deep.equal(BN.from(3));
      expect(await seniorBond.callStatic.tokenOfOwnerByIndex(senior2.address, 0), 'senior1 id of first token should be 2').deep.equal(BN.from(2));

      expect(await seniorBond.callStatic.ownerOf(1), 'correct owner 1').equal(senior1.address);
      expect(await seniorBond.callStatic.ownerOf(2), 'correct owner 2').equal(senior2.address);
      expect(await seniorBond.callStatic.ownerOf(3), 'correct owner 3').equal(senior1.address);

      const [bond1, bond2, bond3] = await Promise.all([smartYield.callStatic.seniorBonds(1), smartYield.callStatic.seniorBonds(2), smartYield.callStatic.seniorBonds(3)]);

      expect(bond1.principal, 'bond1.principal').deep.equal(e18(1));
      expect(bond1.issuedAt, 'bond1.issuedAt').deep.equal(issued1);
      expect(bond1.maturesAt, 'bond1.maturesAt').deep.equal(BN.from(issued1 + A_DAY));
      expect(bond1.liquidated, 'bond1.liquidated').equal(false);

      expect(bond2.principal, 'bond2.principal').deep.equal(e18(1.1));
      expect(bond2.issuedAt, 'bond2.issuedAt').deep.equal(issued2);
      expect(bond2.maturesAt, 'bond2.maturesAt').deep.equal(BN.from(issued2 + (5 * A_DAY)));
      expect(bond2.liquidated, 'bond2.liquidated').equal(false);

      expect(bond3.principal, 'bond3.principal').deep.equal(e18(1.5));
      expect(bond3.issuedAt, 'bond3.issuedAt').deep.equal(issued3);
      expect(bond3.maturesAt, 'bond3.maturesAt').deep.equal(BN.from(issued3 + (30 * A_DAY)));
      expect(bond3.liquidated, 'bond3.liquidated').equal(false);
    });

  });

  describe('redeemBond()', async function () {
    it('redeemBond require matured, unredeemed', async function () {
      const { smartYield, pool, oracle, controller, bondModel, ctokenWorld, underlying, buyTokens, buyBond, redeemBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await buyTokens(junior1, e18(10));
      await buyBond(senior1, e18(1), 1, 1);

      await expect(redeemBond(senior1, 1), 'should throw if not matured (1)').revertedWith('SY: redeemBond not matured');
      await forceNextTime(10);

      await expect(redeemBond(senior1, 1), 'should throw if not matured (2)').revertedWith('SY: redeemBond not matured');
      await forceNextTime(A_DAY - 20);

      await expect(redeemBond(senior1, 1), 'should throw if not matured (3)').revertedWith('SY: redeemBond not matured');
      await forceNextTime(10);

      await redeemBond(senior1, 1);
      await forceNextTime(10);

      await expect(redeemBond(senior1, 1), 'should revert if already redeemed').revertedWith('ERC721: owner query for nonexistent token');

    });

    it('redeemBond gives correct amounts', async function () {
      const { smartYield, pool, oracle, bondModel, ctokenWorld, underlying, controller, buyTokens, buyBond, redeemBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));
      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));

      await controller.setFeeRedeemSeniorBond(0);

      await buyTokens(junior1, e18(10));
      await forceTime(A_DAY);

      const gain1 = await smartYield.callStatic.bondGain(e18(2), 30);
      await buyBond(senior1, e18(2), 1, 30);
      await forceTime(A_DAY);
      expect(await underlying.callStatic.balanceOf(senior1.address), 'senior1 should have 0 underlying').deep.equal(BN.from(0));

      const gain2 = await smartYield.callStatic.bondGain(e18(2.5), 25);
      await buyBond(senior2, e18(2.5), 1, 25);
      await forceTime(A_DAY);
      expect(await underlying.callStatic.balanceOf(senior2.address), 'senior2 should have 0 underlying').deep.equal(BN.from(0));

      await forceTime(A_DAY * 30);
      await Promise.all([
        redeemBond(senior1, 1),
        redeemBond(senior2, 2),
      ]);

      expect(await underlying.balanceOf(senior1.address), 'senior1 should have correct underlying').deep.equal(e18(2).add(gain1));
      expect(await underlying.balanceOf(senior2.address), 'senior2 should have correct underlying').deep.equal(e18(2.5).add(gain2));
    });

    it('redeemBond gives amounts to owner', async function () {
      const { smartYield, pool, oracle, bondModel, ctokenWorld, underlying, controller, buyTokens, buyBond, redeemBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await controller.setProviderRatePerDay(true, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await controller.setFeeRedeemSeniorBond(0);

      await buyTokens(junior1, e18(10));

      await forceTime(10);

      await buyBond(senior1, e18(2), 1, 30);

      const bond1 = await smartYield.seniorBonds(1);

      expect(await underlying.callStatic.balanceOf(senior1.address), 'senior1 should have 0 underlying').deep.equal(BN.from(0));

      await forceNextTime(A_DAY * 30 + 1);

      await redeemBond(senior2, 1); // anyone can call redeem but funds go to owner

      expect(await underlying.callStatic.balanceOf(senior1.address), 'senior1 should have correct underlying').deep.equal(e18(2).add(bond1.gain));
      expect(await underlying.callStatic.balanceOf(senior2.address), 'senior2 should have 0 underlying').deep.equal(BN.from(0));
    });
  });
});
