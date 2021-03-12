import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';

export const withDecimals = (n: BN, decimals: number): string => {
  return new BNj(n.toString()).dividedBy(10**decimals).toFixed(decimals);
};
