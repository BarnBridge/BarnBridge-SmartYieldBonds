// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, dumpBond, dumpAbondState, toBNj, BondType, HT, deployCompoundController, deployJuniorBond, deploySeniorBond, deployYieldOracleMock, currentTime, START_TIME, moveTime, deployClockMock, deploySmartYield, buyTokens, buyBond, redeemBond, deployCompCTokenDump, deployCompComptroller, deployUnderlying, deployBondModelMock, deployCompoundProvider } from '@testhelp/index';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

// computes pay rate for an abond (wei/sec), diff between provided values should be <
const expectPaidEqualsWithinPayRate1Sec = (paidBefore: BN, paidAfter: BN, abondAfter: BondType, msg: string) => {
  const dur = abondAfter.maturesAt.sub(abondAfter.issuedAt).div(e18(1));
  const payRate1Sec = abondAfter.gain.div(dur);
  const diff = paidBefore.sub(paidAfter);

  expect(diff.gte(0), msg + ` Diff ${paidBefore.toString()} - ${paidAfter.toString()} = ${diff.toString()} (before - after) should be >= 0 (payrate=${payRate1Sec.toString()}).`).equal(true);
  expect(diff.lte(payRate1Sec), msg + ` Diff ${paidBefore.toString()} - ${paidAfter.toString()} = ${diff.toString()} should be < payrate/sec (payrate=${payRate1Sec.toString()}).`).equal(true);
};

// computes pay rate for an abond (wei/sec), diff between provided values should be <
const expectDebtEqualsWithinPayRate1Sec = (debtBefore: BN, debtAfter: BN, abondAfter: BondType, msg: string) => {
  const dur = abondAfter.maturesAt.sub(abondAfter.issuedAt).div(e18(1));
  const payRate1Sec = dur.eq(0) ? BN.from(0) : abondAfter.gain.div(dur);
  const diff = debtAfter.sub(debtBefore);

  expect(diff.gte(0), msg + ` Diff ${debtAfter.toString()} - ${debtBefore.toString()} = ${diff.toString()} (after - before) should be >= 0 (payrate=${payRate1Sec.toString()}).`).equal(true);
  expect(diff.lte(payRate1Sec), msg + ` Diff ${debtAfter.toString()} - ${debtBefore.toString()} = ${diff.toString()} (after - before) should be < payrate/sec (payrate=${payRate1Sec.toString()}).`).equal(true);
};

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const clock = await deployClockMock(deployerSign);

    const [bondModel, underlying, comptroller, oracle, controller, pool, smartYield] = await Promise.all([
      deployBondModelMock(deployerSign),
      deployUnderlying(deployerSign, decimals),
      deployCompComptroller(deployerSign),
      deployYieldOracleMock(deployerSign),
      deployCompoundController(deployerSign),
      deployCompoundProvider(deployerSign, clock),
      deploySmartYield(deployerSign, clock),
    ]);

    const [cToken, seniorBond, juniorBond] = await Promise.all([
      deployCompCTokenDump(deployerSign, underlying, comptroller),
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
      (moveTime(clock))(0),
    ]);

    return {
      oracle, smartYield, cToken, bondModel, seniorBond, underlying, controller, pool,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(smartYield, pool, underlying),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      moveTime: moveTime(clock),
    };
  };
};

describe('abond value computations', async function () {

  it('should deploy contracts correctly', async function () {
    const decimals = 18;
    const { smartYield, oracle, controller, bondModel, cToken, underlying, seniorBond, pool } = await bbFixtures(fixture(decimals));

    expect(await smartYield.controller()).equals(controller.address, 'smartYield.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
  });

  describe('first and last bond', async function () {
    it('for one bond, abond is the same', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, seniorBond, moveTime, buyTokens, buyBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(100));

      const abond0 = await smartYield.abond();
      expect(abond0.principal, 'abond principal at start needs to be 0').deep.equal(BN.from(0));
      expect(abond0.gain, 'abond gain at start needs to be 0').deep.equal(BN.from(0));
      expect(abond0.issuedAt, 'abond issuedAt at start needs to be 0').deep.equal(BN.from(0));
      expect(abond0.maturesAt, 'abond maturesAt at start needs to be 0').deep.equal(BN.from(0));
      expect(abond0.liquidated, 'abond liquidated at start needs to be false').equal(false);

      await buyBond(senior1, e18(100), 1, 30);
      const abond1 = await smartYield.abond();
      const bond1 = await smartYield.seniorBonds(1);

      await moveTime(A_DAY * 4);
      expect(abond1.gain, 'abond gain should equal first bought bond').deep.equal(bond1.gain);
      expect(abond1.principal, 'abond principal should  equal first bought bond').deep.equal(bond1.principal);
      expect(abond1.issuedAt.add(1).div(e18(1)), 'abond issuedAt should equal first bought bond').deep.equal(bond1.issuedAt);
      expect(abond1.maturesAt.add(1).div(e18(1)), 'abond maturesAt should equal first bought bond').deep.equal(bond1.maturesAt);
    });

    it('for new bonds, abondPaid stays the same', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, moveTime, buyTokens, buyBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(100));

      await buyBond(senior1, e18(100), 1, 30);
      await moveTime(A_DAY * 4);

      const paidBefore = await smartYield.abondPaid();
      await buyBond(senior1, e18(10), 1, 30);
      const paidAfter = await smartYield.abondPaid();
      const abondAfter = await smartYield.abond();

      expectPaidEqualsWithinPayRate1Sec(paidBefore, paidAfter, abondAfter, 'abondPaid changed');

      await moveTime(A_DAY * 3);
      const paidBefore1 = await smartYield.abondPaid();
      await buyBond(senior2, e18(50), 1, 25);
      const paidAfter1 = await smartYield.abondPaid();
      const abondAfter1 = await smartYield.abond();
      expectPaidEqualsWithinPayRate1Sec(paidBefore1, paidAfter1, abondAfter1, 'abondPaid1 changed');

      await moveTime(A_DAY * 9);
      const paidBefore2 = await smartYield.abondPaid();
      await buyBond(senior2, e18(71.1), 1, 5);
      const paidAfter2 = await smartYield.abondPaid();
      const abondAfter2 = await smartYield.abond();
      expectPaidEqualsWithinPayRate1Sec(paidBefore2, paidAfter2, abondAfter2, 'abondPaid2 changed');

      const paidBefore3 = await smartYield.abondPaid();
      await buyBond(senior2, e18(23.333), 1, 3);
      const paidAfter3 = await smartYield.abondPaid();
      const abondAfter3 = await smartYield.abond();
      expectPaidEqualsWithinPayRate1Sec(paidBefore3, paidAfter3, abondAfter3, 'abondPaid3 changed');
    });

    it('last bond, is abond', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, moveTime, buyTokens, buyBond, redeemBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(100));

      await buyBond(senior1, e18(100), 1, 30);
      const expected = await smartYield.seniorBonds(1);

      await moveTime(A_DAY * 10);

      await buyBond(senior1, e18(10), 1, 10);

      await moveTime(A_DAY * 10 + 1);
      await redeemBond(senior1, 2);
      const abond = await smartYield.abond();
      expect(abond.gain, 'abond gain should be last bond').deep.equal(expected.gain);
      expect(abond.principal, 'abond principal should be last bond').deep.equal(expected.principal);
    });

    it('for bonds redeemed, abondDebt stays the same', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, moveTime, buyTokens, buyBond, redeemBond, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      await bondModel.setRatePerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      await cToken.setExchangeRateStored(exchangeRateStored);
      await buyTokens(junior1, e18(100));

      await buyBond(senior1, e18(100), 1, 90); // 1
      await moveTime(A_DAY * 1);

      await buyBond(senior1, e18(100), 1, 10); // 2
      await moveTime(A_DAY * 10 + 1);

      const debtBefore2 = await smartYield.abondDebt();
      await redeemBond(senior1, 2); // 2
      const debtAfter2 = await smartYield.abondDebt();
      const abondAfter2 = await smartYield.abond();
      expectDebtEqualsWithinPayRate1Sec(debtBefore2, debtAfter2, abondAfter2, 'abondDebt2 changed');
      await moveTime(A_DAY);

      await buyBond(senior1, e18(100), 1, 10); // 3
      await moveTime(A_DAY * 5);

      await buyBond(senior1, e18(100), 1, 20); // 4
      await moveTime(A_DAY * 5 + 1);

      const debtBefore3 = await smartYield.abondDebt();
      await redeemBond(senior1, 3); // 3
      const debtAfter3 = await smartYield.abondDebt();
      const abondAfter3 = await smartYield.abond();
      expectDebtEqualsWithinPayRate1Sec(debtBefore3, debtAfter3, abondAfter3, 'abondDebt3 changed');
      await moveTime(A_DAY * 15);

      const debtBefore4 = await smartYield.abondDebt();
      await redeemBond(senior1, 4); // 4
      const debtAfter4 = await smartYield.abondDebt();
      const abondAfter4 = await smartYield.abond();
      expectDebtEqualsWithinPayRate1Sec(debtBefore4, debtAfter4, abondAfter4, 'abondDebt4 changed');
      await moveTime(A_DAY * 153);

      await buyBond(senior1, e18(10), 1, 90); // 5

      const debtBefore1 = await smartYield.abondDebt();
      await redeemBond(senior1, 1); // 1
      const debtAfter1 = await smartYield.abondDebt();
      const abondAfter1 = await smartYield.abond();
      expectDebtEqualsWithinPayRate1Sec(debtBefore1, debtAfter1, abondAfter1, 'abondDebt1 changed');

      await moveTime(A_DAY * 90 + 1);

      const debtBefore5 = await smartYield.abondDebt();
      await redeemBond(senior1, 5); // 1
      const debtAfter5 = await smartYield.abondDebt();
      const abondAfter5 = await smartYield.abond();
      expectDebtEqualsWithinPayRate1Sec(debtBefore5, debtAfter5, abondAfter5, 'abondDebt5 changed');

    }).timeout(100 * 1000);

  });


});
