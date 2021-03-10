import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, deployBondModel, deployCompoundControllerMock, deployCompoundProvider, deployCTokenWorldMock, deployYieldOracle, e18 } from '@testhelp/index';
import { A_DAY } from '@testhelp/time';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

const oracleCONF = { windowSize: 4 * A_DAY, granularity: 4 };

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, daoSign, guardianSign, feesOwnerSign, smartYieldSign, userSign] = wallets;
    const [deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr] = await Promise.all([
      deployerSign.getAddress(),
      daoSign.getAddress(),
      guardianSign.getAddress(),
      feesOwnerSign.getAddress(),
      smartYieldSign.getAddress(),
      userSign.getAddress(),
    ]);

    const [ctokenWorld] = await Promise.all([
      deployCTokenWorldMock(deployerSign, exchangeRateStored, supplyRatePerBlock, 0, decimals),
    ]);

    const underlying = Erc20MockFactory.connect(await ctokenWorld.callStatic.underlying(), deployerSign);
    const comp = Erc20MockFactory.connect(await ctokenWorld.callStatic.getCompAddress(), deployerSign);
    const compOracle = CompOracleMockFactory.connect(await ctokenWorld.callStatic.oracle(), deployerSign);

    const [pool, bondModel] = await Promise.all([
      deployCompoundProvider(deployerSign, ctokenWorld.address),
      deployBondModel(deployerSign),
    ]);

    const [controller ] = await Promise.all([
      deployCompoundControllerMock(deployerSign, pool.address, smartYieldAddr, bondModel.address, [comp.address, underlying.address]),
    ]);

    const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

    await Promise.all([
      controller.setOracle(oracle.address),
      pool.setup(smartYieldAddr, controller.address),
      controller.setFeeBuyJuniorToken(0),
    ]);

    return {
      controller, pool, bondModel, oracle, underlying, comp, compOracle, ctokenWorld,
      deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr,
      userSign,
      deployerSign: deployerSign as Signer,
      smartYieldSign,
    };
  };
};

describe('CompoundProvider._takeUnderlying() / CompoundProvider._sendUnderlying() ', async function () {

  it('system should be in expected state', async function () {

    const { pool, controller, underlying, ctokenWorld, smartYieldAddr } = await bbFixtures(fixture());

    expect((await pool._setup()), 'should be _setup').equal(true);
    expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
    expect((await pool.controller()), 'should be controller').equal(controller.address);
    expect((await pool.cToken()), 'should be cToken').equal(ctokenWorld.address);
    expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
  });

  it('only smartYield can call _takeUnderlying/_sendUnderlying', async function () {

    const { pool, controller, underlying, ctokenWorld, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

    await expect(pool.connect(deployerSign)._takeUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('PPC: only smartYield/controller');
    await expect(pool.connect(deployerSign)._sendUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('PPC: only smartYield');
    await expect(pool.connect(smartYieldSign)._takeUnderlying(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('PPC: only smartYield/controller');
    await expect(pool.connect(smartYieldSign)._sendUnderlying(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('PPC: only smartYield');
  });

  it('_takeUnderlying takes underlying & checks for allowance', async function () {

    const { pool, underlying, smartYieldSign, deployerAddr, smartYieldAddr, userSign, userAddr } = await bbFixtures(fixture());

    await underlying.mintMock(userAddr, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 1 underlying').deep.equal(e18(1));
    expect(await underlying.balanceOf(pool.address), 'should have 0 underlying').deep.equal(BN.from(0));

    await expect(pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1)), 'revert with no allowance').reverted;

    await underlying.connect(userSign).approve(pool.address, e18(0.5));

    await expect(pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1)), 'revert with not enought allowance').reverted;

    await underlying.connect(userSign).approve(pool.address, e18(1));

    await pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 0 underlying').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(pool.address), 'should have 1 underlying').deep.equal(e18(1));
  });

  it('_sendUnderlying sends underlying', async function () {

    const { pool, underlying, smartYieldSign, deployerAddr, smartYieldAddr, userAddr } = await bbFixtures(fixture());

    await underlying.mintMock(pool.address, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 0 underlying').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(pool.address), 'should have 1 underlying').deep.equal(e18(1));

    await pool.connect(smartYieldSign)._sendUnderlying(userAddr, e18(1));

    expect(await underlying.balanceOf(userAddr), 'should have 1 underlying').deep.equal(e18(1));
    expect(await underlying.balanceOf(pool.address), 'should have 0 underlying').deep.equal(BN.from(0));
  });

});
