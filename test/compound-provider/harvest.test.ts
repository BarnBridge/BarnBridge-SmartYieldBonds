import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, currentTime, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, moveTime, toBN, u2cToken } from '@testhelp/index';

const decimals = 18;
const exchangeRateStored = BN.from('210479247565052203200030081');
const priceCompToUnderlying = e18(2 * 1);

const compToCtoken = (
  compAmount: BN | number,
  priceCompToUnderlying: BN | number,
  exchangeRateStored: BN | number,
  harvestReward: BN | number,
  extraComp: BN | number = 0,
  extraUnderlying: BN | number = 0,

): { cTokens: BN, reward: BN, underlyingFees: BN } => {
  compAmount = toBN(compAmount);
  priceCompToUnderlying = toBN(priceCompToUnderlying);
  exchangeRateStored = toBN(exchangeRateStored);
  harvestReward = toBN(harvestReward);
  extraComp = toBN(extraComp);
  extraUnderlying = toBN(extraUnderlying);

  let underlyingGot = extraUnderlying;
  // uniswap
  underlyingGot = underlyingGot.add(
    (compAmount.add(extraComp)).mul(priceCompToUnderlying).div(e18(1))
  );

  let underlyingFees = extraUnderlying;
  underlyingGot = underlyingGot.sub(extraUnderlying);

  if (extraComp.gt(0)) {
    const extra = underlyingGot.mul(
      extraComp.mul(e18(1)).div(compAmount.add(extraComp))
    ).div(e18(1));

    underlyingFees = underlyingFees.add(extra);
    underlyingGot = underlyingGot.sub(extra);
  }

  const reward = underlyingGot.mul(harvestReward).div(e18(1));
  const cTokens = underlyingGot.sub(reward).add(underlyingFees).mul(e18(1)).div(exchangeRateStored);

  return {
    cTokens,
    reward,
    underlyingFees,
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

describe('CompoundProvider.harvest()', async function () {

  it('pool should be in expected state', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    expect((await pool._setup()), 'should be _setup').equal(true);
    expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
    expect((await pool.controller()), 'should be controller').equal(controller.address);
    expect((await pool.cToken()), 'should be cToken').equal(cToken.address);
    expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    expect((await pool.comptroller()), 'should be comptroller').equal(compComptroller.address);
    expect((await pool.rewardCToken()), 'should be rewardCToken').equal(compToken.address);
    expect((await compComptroller.enterMarketsCalled()), 'should have called enterMarket').equal(BN.from(1));

    expect(await underlying.balanceOf(userAddr), 'caller starts with 0 underlying').deep.equal(0);
    expect(await underlying.balanceOf(pool.address), 'pool starts with 0 underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool starts with 0 COMP').deep.equal(0);
    expect(await cToken.balanceOf(pool.address), 'pool starts with 0 cToken').deep.equal(0);
    expect(await uniswap.swapExactTokensForTokensCalled(), 'no calls to swapExactTokensForTokens').deep.equal(0);
    expect(await compComptroller.claimCompCalled(), 'no calls to claimComp').deep.equal(0);
  });

  it('should reject second setup atempt', async function () {

    const { pool, controller, underlying, cToken, compComptroller, compToken, deployerSign, smartYieldAddr } = await bbFixtures(fixture());

    await expect(pool.connect(deployerSign).setup(smartYieldAddr, controller.address, cToken.address), 'should throw if already _setup').revertedWith('PPC: already setup');
  });


  it('should harvest only once per block, revert otherwise', async function () {

    const { pool,deployerSign, moveTime } = await bbFixtures(fixture());

    // should not fail
    await pool.connect(deployerSign).harvest();

    await expect(pool.connect(deployerSign).harvest(), 'should revert if on the same block/timestamp').revertedWith('PPC: harvest later');

    await moveTime(1);

    // should not fail
    await pool.connect(deployerSign).harvest();
  });

  it('should not call uniswap.swapExactTokensForTokens if no COMP is claimed', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 10 COMP but dont get it
    await pool.connect(deployerSign).setCompRewardExpected(e18(10));
    // get 0 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, 0, 0);

    // call
    await pool.connect(userSign).harvest();

    expect(await pool.cTokenBalance(), 'pool should see correct cToken balance').deep.equal(BN.from(0));
    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(BN.from(0));

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);
    expect(await uniswap.swapExactTokensForTokensCalled(), '0 calls for swapExactTokensForTokens').deep.equal(BN.from(0));
    expect(await cToken.mintCalled(), '0 calls for cToken.mint()').deep.equal(BN.from(0));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('should sell reward and deposit it with compound, rewarding caller', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 8 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(8));
    // get 8 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(8), 0);

    // expect a call
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(8), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    const expected = compToCtoken(e18(8), priceCompToUnderlying, exchangeRateStored, harvestReward);

    // call
    await pool.connect(userSign).harvest();

    expect(await pool.cTokenBalance(), 'pool should see correct cToken balance').deep.equal(expected.cTokens);
    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expected.cTokens);
    expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(expected.reward);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);
    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('should sell reward and deposit it with compound, when someone calls claimComp on us, rewarding caller', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 8 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(8));

    // get 3 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(3), 0);
    // someone calls claimComp instead of us, gives pool 3 COMP
    await compComptroller.connect(userSign).claimComp([pool.address], [cToken.address], false, true);

    expect(await compToken.balanceOf(pool.address), 'pool has 3 COMP').deep.equal(e18(3));
    expect(await uniswap.swapExactTokensForTokensCalled(), '0 calls for swapExactTokensForTokens').deep.equal(0);
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));

    // pool gets only 5 COMP from claimComp on next call
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(5), 0);

    // expect a call
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(8), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    // we expect to get 3 COMP from external call + 5 COMP from pool call
    const expected = compToCtoken(e18(8), priceCompToUnderlying, exchangeRateStored, harvestReward);

    // call
    await pool.connect(userSign).harvest();

    expect(await pool.cTokenBalance(), 'pool should see correct cToken balance').deep.equal(expected.cTokens);
    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expected.cTokens);
    expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(expected.reward);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('should sell reward and deposit it with compound, when someone calls claimComp on us and dumps COMP on the pool, rewarding caller and dumped COMP going to fees', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%
    const _exchangeRateStored = e18(1);

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    await cToken.setup(underlying.address, compComptroller.address, _exchangeRateStored);

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 10 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(10));

    // get 5 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(5), 0);
    // someone calls claimComp instead of us, gives pool 5 COMP
    await compComptroller.connect(userSign).claimComp([pool.address], [cToken.address], false, true);

    expect(await compToken.balanceOf(pool.address), 'pool has 5 COMP').deep.equal(e18(5));
    expect(await uniswap.swapExactTokensForTokensCalled(), '0 calls for swapExactTokensForTokens').deep.equal(0);
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));

    await compToken.mintMock(pool.address, e18(5));
    expect(await compToken.balanceOf(pool.address), 'pool has 10 COMP').deep.equal(e18(10));

    // pool gets only 5 COMP from claimComp on next call
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(5), 0);

    // expect a call to sell all COMP
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(15), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    // reward only from the 10 COMP expected
    const expected = compToCtoken(e18(10), priceCompToUnderlying, _exchangeRateStored, harvestReward, e18(5), 0);

    // call
    await pool.connect(userSign).harvest();

    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expected.cTokens);
    expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(expected.reward);
    expect(await pool.underlyingFees(), 'fees should be correct').deep.equal(expected.underlyingFees);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('should sell reward and deposit it with compound, when someone calls claimComp on us and dumps COMP + underlying on the pool, rewarding caller, dumped COMP + underlying going to fees', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%
    const _exchangeRateStored = e18(1);

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    await cToken.setup(underlying.address, compComptroller.address, _exchangeRateStored);

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 10 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(10));

    // get 5 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(5), 0);
    // someone calls claimComp instead of us, gives pool 5 COMP
    await compComptroller.connect(userSign).claimComp([pool.address], [cToken.address], false, true);

    expect(await compToken.balanceOf(pool.address), 'pool has 5 COMP').deep.equal(e18(5));
    expect(await uniswap.swapExactTokensForTokensCalled(), '0 calls for swapExactTokensForTokens').deep.equal(0);
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));

    await compToken.mintMock(pool.address, e18(5));
    expect(await compToken.balanceOf(pool.address), 'pool has 10 COMP').deep.equal(e18(10));

    // pool gets 5 underlying dumped on
    await underlying.mintMock(pool.address, e18(5));
    expect(await underlying.balanceOf(pool.address), 'pool has 5 underlying').deep.equal(e18(5));

    // pool gets only 5 COMP from claimComp on next call
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, e18(5), 0);

    // expect a call to sell all COMP
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(15), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    // reward only from the 10 COMP expected
    const expected = compToCtoken(e18(10), priceCompToUnderlying, _exchangeRateStored, harvestReward, e18(5), e18(5));

    // call
    await pool.connect(userSign).harvest();

    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expected.cTokens);
    expect(await underlying.balanceOf(userAddr), 'caller should get correct reward').deep.equal(expected.reward);
    expect(await pool.underlyingFees(), 'fees should be correct').deep.equal(expected.underlyingFees);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('No COMP from claimComp(): If COMP + underlying are dumped on pool, they go to fees. caller gets 0 reward', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%
    const _exchangeRateStored = e18(1);

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    await cToken.setup(underlying.address, compComptroller.address, _exchangeRateStored);

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 0 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(0));

    // get 0 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, 0, 0);

    // dump 5 comp on pool
    await compToken.connect(deployerSign).mintMock(pool.address, e18(5));

    // dump 5 underlying on pool
    await underlying.connect(deployerSign).mintMock(pool.address, e18(5));

    expect(await compToken.balanceOf(pool.address), 'pool has 5 COMP').deep.equal(e18(5));
    expect(await underlying.balanceOf(pool.address), 'pool has 5 underlying').deep.equal(e18(5));

    // expect to sell 5 COMP
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(5), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    // underlying + COMP -> underlying
    const expectedUnderlyingFees = e18(5).add(e18(5).mul(priceCompToUnderlying).div(e18(1)));

    // underlying + COMP -> cToken
    const expectedPoolCtokenBalance = u2cToken(
      expectedUnderlyingFees,
      _exchangeRateStored
    );

    // call
    await pool.connect(userSign).harvest();

    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expectedPoolCtokenBalance);
    expect(await underlying.balanceOf(userAddr), 'caller should get 0 reward').deep.equal(BN.from(0));
    expect(await pool.underlyingFees(), 'fees should be correct').deep.equal(expectedUnderlyingFees);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('No COMP from claimComp(): If COMP is dumped on pool, they go to fees. caller gets 0 reward', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%
    const _exchangeRateStored = e18(1);

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    await cToken.setup(underlying.address, compComptroller.address, _exchangeRateStored);

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 0 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(0));

    // get 0 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, 0, 0);

    // dump 5 comp on pool
    await compToken.connect(deployerSign).mintMock(pool.address, e18(5));

    expect(await compToken.balanceOf(pool.address), 'pool has 5 COMP').deep.equal(e18(5));
    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));

    // expect to sell 5 COMP
    await uniswap.connect(deployerSign).expectCallSwapExactTokensForTokens(e18(5), 0, [compToken.address, underlying.address], pool.address, currentTime().add(1800));

    // COMP -> underlying
    const expectedUnderlyingFees = (e18(5).mul(priceCompToUnderlying).div(e18(1)));

    // underlying -> cToken
    const expectedPoolCtokenBalance = u2cToken(
      expectedUnderlyingFees,
      _exchangeRateStored
    );

    // call
    await pool.connect(userSign).harvest();

    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expectedPoolCtokenBalance);
    expect(await underlying.balanceOf(userAddr), 'caller should get 0 reward').deep.equal(BN.from(0));
    expect(await pool.underlyingFees(), 'fees should be correct').deep.equal(expectedUnderlyingFees);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await uniswap.swapExactTokensForTokensCalled(), '1 call for swapExactTokensForTokens').deep.equal(BN.from(1));
    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

  it('No COMP from claimComp(): If underlying is dumped on pool, they go to fees. caller gets 0 reward', async function () {

    const harvestReward = BN.from(5).mul(e18(1)).div(100); // 5%
    const _exchangeRateStored = e18(1);

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, deployerSign, smartYieldAddr, userSign, userAddr,  moveTime } = await bbFixtures(fixture());

    await cToken.setup(underlying.address, compComptroller.address, _exchangeRateStored);

    // set reward
    await controller.connect(deployerSign).setHarvestReward(harvestReward);

    // expected 0 COMP
    await pool.connect(deployerSign).setCompRewardExpected(e18(0));

    // get 0 COMP from claimComp
    await compComptroller.connect(deployerSign).reset(pool.address, cToken.address, compToken.address, 0, 0);

    // dump 5 underlying on pool
    await underlying.connect(deployerSign).mintMock(pool.address, e18(5));

    expect(await compToken.balanceOf(pool.address), 'pool has 0 COMP').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(pool.address), 'pool has 5 underlying').deep.equal(e18(5));

    // expect no uniswap call
    expect(await uniswap.swapExactTokensForTokensCalled(), '0 call for swapExactTokensForTokens').deep.equal(BN.from(0));

    // underlying -> underlying
    const expectedUnderlyingFees = e18(5);

    // underlying -> cToken
    const expectedPoolCtokenBalance = u2cToken(
      expectedUnderlyingFees,
      _exchangeRateStored
    );

    // call
    await pool.connect(userSign).harvest();

    expect(await cToken.balanceOf(pool.address), 'pool should get correct cTokens').deep.equal(expectedPoolCtokenBalance);
    expect(await underlying.balanceOf(userAddr), 'caller should get 0 reward').deep.equal(BN.from(0));
    expect(await pool.underlyingFees(), 'fees should be correct').deep.equal(expectedUnderlyingFees);

    expect(await underlying.balanceOf(pool.address), 'pool should not have underlying').deep.equal(0);
    expect(await compToken.balanceOf(pool.address), 'pool should not have COMP').deep.equal(0);

    expect(await compComptroller.claimCompCalled(), '1 call for claimComp').deep.equal(BN.from(1));
  });

});

