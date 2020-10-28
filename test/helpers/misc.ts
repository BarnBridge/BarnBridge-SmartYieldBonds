import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';

export const toWei = (n: BNj): BN => {
  return BN.from(n.times(new BNj(10).pow(18)).toFixed(0).toString());
};
