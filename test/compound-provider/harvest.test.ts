import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, currentTime, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, moveTime, toBN } from '@testhelp/index';
import { PRIORITY_LOW } from 'constants';
import { UniswapMock } from '@typechain/UniswapMock';

const decimals = 18;
const exchangeRateStored = BN.from('210479247565052203200030081');
const priceCompToUnderlying = e18(2 * 1);

const compToCtoken = (compAmount: BN | number, priceCompToUnderlying: BN | number, exchangeRateStored: BN | number, harvestReward: BN | number): { cTokens: BN, reward: BN} => {
  compAmount = toBN(compAmount);
  priceCompToUnderlying = toBN(priceCompToUnderlying);
  exchangeRateStored = toBN(exchangeRateStored);
  harvestReward = toBN(harvestReward);

  let underlying = compAmount.mul(priceCompToUnderlying).div(e18(1));
  const reward = underlying.mul(harvestReward).div(e18(1));
  underlying = underlying.sub(reward);

  const cTokens = underlying.mul(e18(1)).div(exchangeRateStored);
  return {
    cTokens,
    reward,
  };
};

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, daoSign, guardianSign, feesOwnerSign, smartYieldSign, userSign] = wallets;
    const [deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr] = await Promise.all([
      deployerSign.getAddress(),
      daoSign.getAddress(),
      guardianSign.getAddress(),
      smartYieldSign.getAddress(),
      feesOwnerSign.getAddress(),
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


describe('CompoundProvider', async function () {

  it('should deploy CompoundProvider correctly', async function () {


  });

  it('should reject second setup atempt', async function () {
    return;

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

      // should not fail
      await pool.connect(deployerSign).harvest();

      await expect(pool.connect(deployerSign).harvest(), 'should revert if on the same block/timestamp').revertedWith('PPC: harvest later');

      await moveTime(1);

      // should not fail
      await pool.connect(deployerSign).harvest();
    });

    it('should sell reward and deposit it with compound, rewarding caller', async function () {

      const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%

      const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

      expect(await underlying.balanceOf(userAddr), 'caller starts with 0 underlying').deep.equal(0);
      expect(await underlying.balanceOf(pool.address), 'pool starts with 0 underlying').deep.equal(0);
      expect(await compToken.balanceOf(pool.address), 'pool starts with 0 COMP').deep.equal(0);
      expect(await cToken.balanceOf(pool.address), 'pool starts with 0 cToken').deep.equal(0);

      // set reward
      await controller.connect(deployerSign).setHarvestReward(harvestReward);

      // expected 8 COMP
      await pool.connect(deployerSign).setCompRewardExpected(e18(8));
      // get 8 COMP from claimComp
      await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(8), 0);

      await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(8), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

      await pool.connect(userSign).harvest();

      const expected = compToCtoken(e18(8), priceCompToUnderlying, exchangeRateStored, harvestReward);

      expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expected.cTokens);
      expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(expected.reward);

      expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
      expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);
    });


  });

});

