import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, currentTime, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, moveTime, toBN, u2cToken } from '@testhelp/index';

const decimals = 18;
const exchangeRateStored = BN.from('210479247565052203200030081');
const priceCompToUnderlying = e18(2 * 1);

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
      cToken.setup(underlying.address, compComptroller.address, exchangeRateStored),
      uniswap.setup(compToken.address, underlying.address, priceCompToUnderlying),
    ]);

    await Promise.all([
      (moveTime(clock))(0),
    ]);

    return {
      underlying, cToken, compToken, compComptroller, uniswap, oracle, controller, pool, clock,

      deployerSign: deployerSign as Signer,
      daoSign: daoSign as Signer,
      guardianSign: guardianSign as Signer,
      feesOwnerSign: feesOwnerSign as Signer,
      smartYieldSign: smartYieldSign as Signer,
      userSign: userSign as Signer,

      deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr,

      moveTime: moveTime(clock),
    };
  };
};

describe('CompoundProvider.setup()', async function () {

  it('sets currect values', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    expect((await pool._setup()), 'should not be _setup').equal(false);

    pool.setup(smartYieldAddr, controller.address, cToken.address);

    expect((await pool._setup()), 'should be _setup').equal(true);
    expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
    expect((await pool.controller()), 'should be controller').equal(controller.address);
    expect((await pool.cToken()), 'should be cToken').equal(cToken.address);
    expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    expect((await pool.comptroller()), 'should be comptroller').equal(compComptroller.address);
    expect((await pool.rewardCToken()), 'should be rewardCToken').equal(compToken.address);
    expect((await compComptroller.enterMarketsCalled()), 'should have called enterMarket').equal(BN.from(1));
  });

  it('should reject second setup atempt', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldAddr } = await bbFixtures(fixture());

    // should work
    pool.setup(smartYieldAddr, controller.address, cToken.address);

    await expect(pool.connect(deployerSign).setup(smartYieldAddr, controller.address, cToken.address), 'should throw if already _setup').revertedWith('PPC: already setup');
  });

});
