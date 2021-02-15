import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { toBN, e18 } from './misc';

export const u2cToken = (underlyingAmount: BN | number, exchangeRateStorred: BN | number): BN => {
  underlyingAmount = toBN(underlyingAmount);
  exchangeRateStorred = toBN(exchangeRateStorred);

  return (underlyingAmount.mul(e18(1))).div(exchangeRateStorred);
};

export const c2uToken = (cTokenAmount: BN, exchangeRateStorred: BN): BN => {
  cTokenAmount = toBN(cTokenAmount);
  exchangeRateStorred = toBN(exchangeRateStorred);

  return cTokenAmount.mul(exchangeRateStorred).div(e18(1));
};
