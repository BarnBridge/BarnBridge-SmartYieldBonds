import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { deployClockMock, deployCompComptroller, deployCompCToken, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, deployCompoundController, deployCompoundProviderMock, moveTime, e18, bbFixtures, u2cToken, c2uToken, currentTime } from '@testhelp/index';

const decimals = 18;
const exchangeRateStored = BN.from('210556403624870043031797183');
const priceCompToUnderlying = e18(2 * 1);

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
      deployCompoundProviderMock(deployerSign, clock),
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

describe('CompoundProvider.transferFees()', async function () {

  it('system should be in expected state', async function () {
    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, oracle, deployerSign, smartYieldAddr, userSign, userAddr, feesOwnerAddr,  moveTime } = await bbFixtures(fixture());
    expect(await cToken.balanceOf(feesOwnerAddr), 'initially no cTokens on feesOwnerAddr').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(feesOwnerAddr), 'initially no underlying on feesOwnerAddr').deep.equal(BN.from(0));
    expect(await pool.underlyingBalanceLast(), 'initially underlyingBalanceLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeCtokenBalanceLast(), 'initially cumulativeCtokenBalanceLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeSecondlyYieldLast(), 'initially cumulativeSecondlyYieldLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeTimestampLast(), 'initially cumulativeTimestampLast is 0').deep.equal(BN.from(0));
    expect(await oracle.updateCalled(), 'initially oracle update not called').deep.equal(BN.from(0));

  });

  it('should transfer fees to feesOwner', async function () {
    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, oracle, deployerSign, smartYieldAddr, userSign, userAddr, feesOwnerAddr,  moveTime } = await bbFixtures(fixture());

    // pool has 10 cToken, 0.3 underlying in fees
    await cToken.connect(deployerSign).mintMock(pool.address, e18(10));
    await pool.connect(deployerSign).setInputsTransferFees(e18(10), e18(0.3));

    expect(await cToken.balanceOf(pool.address), 'pool has cTokens').deep.equal(e18(10));

    await pool.connect(userSign).transferFees();

    expect(await cToken.balanceOf(feesOwnerAddr), 'no cTokens on feesOwnerAddr after reward').deep.equal(BN.from(0));

    const expectedFees = c2uToken(u2cToken(e18(0.3), exchangeRateStored), exchangeRateStored);
    const expectedCtokenBalance = e18(10).sub(u2cToken(e18(0.3), exchangeRateStored));
    const expectedUnderlyingBalanceLast = c2uToken(expectedCtokenBalance, exchangeRateStored);

    expect(await underlying.balanceOf(feesOwnerAddr), 'correct fees in underlying on feesOwnerAddr').deep.equal(expectedFees);
    expect(await cToken.balanceOf(pool.address), 'cTokens - fees on feesOwnerAddr after reward').deep.equal(expectedCtokenBalance);
    expect(await pool.cTokenBalance(), 'pool tracks cToken balance').deep.equal(expectedCtokenBalance);
    expect(await pool.underlyingFees(), 'no fees left on pool').deep.equal(BN.from(0));
    expect(await pool.underlyingBalanceLast(), 'correct underlyingBalanceLast').deep.equal(expectedUnderlyingBalanceLast);

    const expectedCtokenBalancePrev = e18(10);
    const expectedCumulativeCtokenBalanceLast = expectedCtokenBalancePrev.mul(currentTime().mod(BN.from(2).pow(32)));

    expect(await pool.cumulativeCtokenBalanceLast(), 'cumulativeCtokenBalanceLast is 0').deep.equal(expectedCumulativeCtokenBalanceLast);
    expect(await pool.cumulativeSecondlyYieldLast(), 'cumulativeSecondlyYieldLast is 0').deep.equal(BN.from(0));
    const expectedCumulativeTimestampLast = currentTime().mod(BN.from(2).pow(32));
    expect(await pool.cumulativeTimestampLast(), 'cumulativeTimestampLast is now').deep.equal(expectedCumulativeTimestampLast);
    expect(await oracle.updateCalled(), 'oracle updated').deep.equal(BN.from(1));
  });

  it('should transfer fees to feesOwner, ignoring cToken dumped on pool', async function () {
    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, oracle, deployerSign, smartYieldAddr, userSign, userAddr, feesOwnerAddr,  moveTime } = await bbFixtures(fixture());

    // pool has 10 cToken, 0.3 underlying in fees
    await pool.connect(deployerSign).setInputsTransferFees(e18(10), e18(0.3));
    // extra 10 cTokens dumped on pool
    await cToken.connect(deployerSign).mintMock(pool.address, e18(20));

    expect(await cToken.balanceOf(pool.address), 'pool has cTokens').deep.equal(e18(20));

    await pool.connect(userSign).transferFees();

    expect(await cToken.balanceOf(feesOwnerAddr), 'no cTokens on feesOwnerAddr after reward').deep.equal(BN.from(0));

    // fees include 0.3 underlying + 10 cTokens
    const expectedFees = c2uToken(u2cToken(e18(0.3), exchangeRateStored), exchangeRateStored).add(c2uToken(e18(10), exchangeRateStored));
    // balance does not include the extra 10 cTokens
    const expectedCtokenBalance = e18(10).sub(u2cToken(e18(0.3), exchangeRateStored));
    const expectedUnderlyingBalanceLast = c2uToken(expectedCtokenBalance, exchangeRateStored);

    expect(await underlying.balanceOf(feesOwnerAddr), 'correct fees in underlying on feesOwnerAddr').deep.equal(expectedFees);
    expect(await cToken.balanceOf(pool.address), 'cTokens - fees on feesOwnerAddr after reward').deep.equal(expectedCtokenBalance);
    expect(await pool.cTokenBalance(), 'pool tracks cToken balance').deep.equal(expectedCtokenBalance);
    expect(await pool.underlyingFees(), 'no fees left on pool').deep.equal(BN.from(0));
    expect(await pool.underlyingBalanceLast(), 'correct underlyingBalanceLast').deep.equal(expectedUnderlyingBalanceLast);

    const expectedCtokenBalancePrev = e18(10);
    const expectedCumulativeCtokenBalanceLast = expectedCtokenBalancePrev.mul(currentTime().mod(BN.from(2).pow(32)));

    expect(await pool.cumulativeCtokenBalanceLast(), 'cumulativeCtokenBalanceLast is 0').deep.equal(expectedCumulativeCtokenBalanceLast);
    expect(await pool.cumulativeSecondlyYieldLast(), 'cumulativeSecondlyYieldLast is 0').deep.equal(BN.from(0));
    const expectedCumulativeTimestampLast = currentTime().mod(BN.from(2).pow(32));
    expect(await pool.cumulativeTimestampLast(), 'cumulativeTimestampLast is now').deep.equal(expectedCumulativeTimestampLast);
    expect(await oracle.updateCalled(), 'oracle updated').deep.equal(BN.from(1));
  });

});

