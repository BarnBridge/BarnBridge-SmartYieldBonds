// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import {
  bbFixtures,
  e18,
  A_DAY,
  BLOCKS_PER_DAY,
  deployClockMock,
  deployBondModel,
  deployUnderlying,
  deployCompComptroller,
  deployCompoundController,
  deployCompoundProviderMock,
  deploySmartYieldMock,
  deployYieldOracle,
  deploySeniorBondMock,
  deployCompCTokenYielding,
  deployJuniorBondMock,
  moveTime,
  buyTokens,
  sellTokens,
  buyBond,
  redeemBond,
  currentTime, toBN
} from '@testhelp/index';

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
      deployCompoundProviderMock(deployerSign, clock),
      deploySmartYieldMock(deployerSign, clock),
    ]);

    const [oracle, cToken, seniorBond, juniorBond] = await Promise.all([
      deployYieldOracle(deployerSign, pool, 4 * A_DAY, 4),
      deployCompCTokenYielding(deployerSign, underlying, comptroller, clock, exchangeRateStored),
      deploySeniorBondMock(deployerSign, smartYield),
      deployJuniorBondMock(deployerSign, smartYield),
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
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      moveTime: moveTime(clock),
    };
  };
};

describe('Controller', async function () {
  it('should deploy contracts correctly', async function () {
    const { smartYield, pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await smartYield.juniorBond()).equals(juniorBond.address, 'smartYield.juniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    expect(await oracle.pool()).equals(pool.address, 'oracle.pool()');
  });


  describe('testing Icontroller and Governed', async function () {
    it('Icontroller', async function () {
      const { controller, senior1, smartYield } = await bbFixtures(fixture(decimals));
      await expect(controller.connect(senior1).setBondMaxRatePerDay(e18(10))).to.be.revertedWith('GOV: not dao/guardian');
      await expect(controller.connect(senior1).setPaused(false, true)).to.be.revertedWith('GOV: not dao/guardian');
      await controller.setPaused(true, true);
      await expect(smartYield.buyTokens(toBN(10), 1, currentTime().add(20))).to.be.revertedWith('SY: buyTokens paused');
      await controller.setBondMaxRatePerDay(toBN(10));
      expect (await controller['BOND_MAX_RATE_PER_DAY()']()).to.be.equal(toBN(10));


    });
    it('Governed', async function () {
      const { controller, senior1, deployerSign } = await bbFixtures(fixture(decimals));
      const deployerSignAddr = await deployerSign.getAddress();
      expect(await controller.dao()).to.be.equal(deployerSignAddr);
      expect(await controller.guardian()).to.be.equal(deployerSignAddr);
      await expect(controller.connect(senior1).setDao(senior1.address)).to.be.revertedWith('GOV: not dao');
      await expect(controller.connect(senior1).setGuardian(senior1.address)).to.be.revertedWith('GOV: not dao');

      await controller.setGuardian(senior1.address);
      await controller.setDao(senior1.address);

      expect(await controller.dao()).to.be.equal(senior1.address);
      expect(await controller.guardian()).to.be.equal(senior1.address);

    });
  });


});
