import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, moveTime } from '@testhelp/index';
import { PRIORITY_LOW } from 'constants';

const decimals = 18;

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, daoSign, guardianSign, feesOwnerSign, smartYieldSign] = wallets;
    const [deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr] = await Promise.all([
      deployerSign.getAddress(),
      daoSign.getAddress(),
      guardianSign.getAddress(),
      smartYieldSign.getAddress(),
      feesOwnerSign.getAddress(),
    ]);

    const clock = await deployClockMock(deployerSign);

    const [underlying, cToken, compToken, compComptroller, uniswap, oracle, controller, pool] = await Promise.all([
      deployUnderlying(deployerSign, decimals),
      deployCompCToken(deployerSign),
      deployCompToken(deployerSign),
      deployCompComptroller(deployerSign),
      deployUniswapMock(deployerSign),
      deployYieldOracleMock(deployerSign),
      deployCompoundController(deployerSign),
      deployCompoundProviderMockCompRewardExpected(deployerSign, clock),
    ]);

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setFeesOwner(feesOwnerAddr),
      controller.setUniswap(uniswap.address),
      controller.setUniswapPath([compToken.address, underlying.address]),
      compComptroller.reset(pool.address, cToken.address, compToken.address, 0, 0),
      cToken.setup(underlying.address, compComptroller.address, e18(2 * 1)),
      uniswap.setup(compToken.address, underlying.address, e18(2 * 1)),
    ]);

    await Promise.all([
      pool.setup(smartYieldAddr, controller.address, cToken.address),
      (moveTime(clock))(0),
    ]);

    return {
      underlying, cToken, compToken, compComptroller, uniswap, oracle, controller, pool, clock,

      deployerSign: deployerSign as Signer,
      daoSign: daoSign as Signer,
      guardianSign: guardianSign as Signer,
      feesOwnerSign: feesOwnerSign as Signer,
      smartYieldSign: smartYieldSign as Signer,

      deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr,

      moveTime: moveTime(clock),
    };
  };
};


describe('CompoundProvider', async function () {

  it('should deploy CompoundProvider correctly', async function () {


  });

  it('should reject second setup atempt', async function () {
    const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldAddr } = await bbFixtures(fixture());

    expect((await pool._setup()), 'should be _setup').equal(true);
    expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
    expect((await pool.controller()), 'should be controller').equal(controller.address);
    expect((await pool.cToken()), 'should be cToken').equal(cToken.address);
    expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    expect((await pool.comptroller()), 'should be comptroller').equal(compComptroller.address);
    expect((await pool.rewardCToken()), 'should be rewardCToken').equal(compToken.address);

    expect((await compComptroller.enterMarketsCalled()), 'should have called enterMarket').equal(BN.from(1));

    await expect(pool.connect(deployerSign).setup(smartYieldAddr, controller.address, cToken.address), 'should throw if already _setup').revertedWith('PPC: already setup');
  });

  describe('harvest()', async function () {

    it('should harvest only once per block, revert otherwise', async function () {
      const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldAddr, moveTime } = await bbFixtures(fixture());

      await pool.connect(deployerSign).harvest();

      await expect(pool.connect(deployerSign).harvest(), 'should revert if on the same block/timestamp').revertedWith('PPC: harvest later');

      await moveTime(1);

      await pool.connect(deployerSign).harvest();

    });

    it('should sell reward and deposit it with compound', async function () {

    });


  });

});
