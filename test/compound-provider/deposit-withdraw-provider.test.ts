import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, currentTime, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, moveTime, toBN, u2cToken } from '@testhelp/index';

const decimals = 18;
const exchangeRateStored = BN.from('210479247565052203200030081');

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
      uniswap.setup(compToken.address, underlying.address, 0),
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
      userSign: userSign as Signer,

      deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr,

      moveTime: moveTime(clock),
    };
  };
};

describe('CompoundProvider._depositProvider() / CompoundProvider._withdrawProvider() ', async function () {

  it('system should be in expected state', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    expect((await pool._setup()), 'should be _setup').equal(true);
    expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
    expect((await pool.controller()), 'should be controller').equal(controller.address);
    expect((await pool.cToken()), 'should be cToken').equal(cToken.address);
    expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    expect((await pool.comptroller()), 'should be comptroller').equal(compComptroller.address);
    expect((await pool.rewardCToken()), 'should be rewardCToken').equal(compToken.address);
  });

  it('only smartYield can call _depositProvider/_withdrawProvider', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

    await expect(pool.connect(deployerSign)._depositProvider(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('IPP: only smartYield');
    await expect(pool.connect(deployerSign)._withdrawProvider(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('IPP: only smartYield');
    await expect(pool.connect(smartYieldSign)._depositProvider(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('IPP: only smartYield');
    await expect(pool.connect(smartYieldSign)._withdrawProvider(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('IPP: only smartYield');
  });

  it('_depositProvider deposits to provider', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
    expect(await cToken.balanceOf(pool.address), 'pool has 0 cToken').deep.equal(BN.from(0));

    await underlying.mintMock(pool.address, e18(1));

    expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

    await pool.connect(smartYieldSign)._depositProvider(e18(1), 0);

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
    const expectCtokens = u2cToken(e18(1), exchangeRateStored);
    expect(await cToken.balanceOf(pool.address), 'pool has correct cToken').deep.equal(expectCtokens);

  });


});
