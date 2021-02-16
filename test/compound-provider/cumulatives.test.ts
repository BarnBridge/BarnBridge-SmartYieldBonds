import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { A_DAY, bbFixtures, currentTime, deployClockMock, deployCompComptroller, deployCompCToken, deployCompoundController, deployCompoundProviderMockCompRewardExpected, deployCompToken, deployUnderlying, deployUniswapMock, deployYieldOracleMock, e18, e18j, moveTime, toBN, toBNj, u2cToken } from '@testhelp/index';
import { CompoundProviderMock } from '@typechain/CompoundProviderMock';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { CTokenMock } from '@typechain/CTokenMock';
import { ClockMock } from '@typechain/ClockMock';

const decimals = 18;
const exchangeRateStored = BN.from('211054729931086430699973196');
const priceCompToUnderlying = e18(2 * 1);

export const depositProvider = (pool: CompoundProviderMock, underlying: Erc20Mock, smartYieldSign: Signer) => {
  return async (underlyingAmount: number | BN, fees: number | BN): Promise<void> => {
    underlyingAmount = BN.from(underlyingAmount);
    fees = BN.from(fees);
    await underlying.mintMock(pool.address, underlyingAmount);
    await pool.connect(smartYieldSign)._depositProvider(underlyingAmount, fees);
  };
};

export const withdrawProvider  = (pool: CompoundProviderMock, underlying: Erc20Mock, smartYieldSign: Signer) => {
  return async (underlyingAmount: number | BN, fees: number | BN): Promise<void> => {
    underlyingAmount = BN.from(underlyingAmount);
    fees = BN.from(fees);
    await pool.connect(smartYieldSign)._withdrawProvider(underlyingAmount, fees);
    await underlying.burnMock(pool.address, underlyingAmount);
  };
};

export const yieldCompound = (cToken: CTokenMock, moveTime: (seconds: number | BN | BNj) => Promise<void>) => {
  return async (prevExchangeRate: BN | number, apy: number, increaseTime: number): Promise<BN> => {

    prevExchangeRate = toBN(prevExchangeRate);

    const initialEx = prevExchangeRate;

    const ratePerDay = BN.from(
      toBNj(Math.pow(1 + apy, 1/365) - 1).multipliedBy(e18j(1)).toFixed(0)
    );

    for (let i = 0; i < Math.floor(increaseTime / A_DAY); i++) {
      prevExchangeRate = prevExchangeRate.mul(e18(1).add(ratePerDay)).div(e18(1));
    }


    console.log('daily rate: ', ratePerDay.toString());

    const inc = e18(1).add(ratePerDay.mul(increaseTime - A_DAY * Math.floor(increaseTime / A_DAY)).div(A_DAY));

    const exchangeRate = prevExchangeRate.mul(inc).div(e18(1));

    await Promise.all([
      cToken.setExchangeRateStored(exchangeRate),
      moveTime(increaseTime),
    ]);

    return exchangeRate;
  };
};

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
      depositProvider: depositProvider(pool, underlying, smartYieldSign),
      withdrawProvider: withdrawProvider(pool, underlying, smartYieldSign),
      yieldCompound: yieldCompound(cToken, moveTime(clock)),
    };
  };
};

describe('CompoundProvider cumulatives', async function () {

  it('system should be in expected state', async function () {
    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, oracle, deployerSign, smartYieldAddr, userSign, userAddr, feesOwnerAddr, moveTime } = await bbFixtures(fixture());

    expect(await cToken.balanceOf(feesOwnerAddr), 'initially no cTokens on feesOwnerAddr').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(feesOwnerAddr), 'initially no underlying on feesOwnerAddr').deep.equal(BN.from(0));
    expect(await pool.underlyingBalanceLast(), 'initially underlyingBalanceLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeCtokenBalanceLast(), 'initially cumulativeCtokenBalanceLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeSecondlyYieldLast(), 'initially cumulativeSecondlyYieldLast is 0').deep.equal(BN.from(0));
    expect(await pool.cumulativeTimestampLast(), 'initially cumulativeTimestampLast is 0').deep.equal(BN.from(0));
    expect(await oracle.updateCalled(), 'initially oracle update not called').deep.equal(BN.from(0));

  });

  it('state is expected after first deposit' , async function () {

    return;

    const { pool, controller, underlying, cToken, compComptroller, compToken, uniswap, oracle, deployerSign, smartYieldAddr, userSign, userAddr, feesOwnerAddr, moveTime, depositProvider, yieldCompound } = await bbFixtures(fixture());


    let exchangeRate = exchangeRateStored;

    await depositProvider(e18(1), 0);

    const secYield = await pool.cumulativeSecondlyYieldLast();

    console.log('secYield', secYield.toString());

    exchangeRate = await yieldCompound(exchangeRate, 0.1, Math.floor(A_DAY * 0.5));

    await depositProvider(1, 0);

    const secYield2 = await pool.cumulativeSecondlyYieldLast();

    console.log('secYield2',secYield2.toString());

    exchangeRate = await yieldCompound(exchangeRate, 0.1, Math.floor(A_DAY * 0.5));

    await depositProvider(1, 0);

    const secYield3 = await pool.cumulativeSecondlyYieldLast();

    console.log('secYield3', secYield3.toString());

    console.log(secYield3.sub(secYield2).div(Math.floor(A_DAY * 0.5)).mul(A_DAY).toString());
  });

});
