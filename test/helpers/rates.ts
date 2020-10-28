import { BigNumber as BNj } from 'bignumber.js';

export const withCompoundRate = (principal: BNj, rate: BNj, n: number): BNj => {
  // ((((Rate / ETH Mantissa * Blocks Per Day + 1) ^ Days Per Year - 1)) - 1) * 100
  const apy = new BNj(1).plus(rate).pow(n - 1).minus(1);
  return principal.plus(principal.times(apy));
};
