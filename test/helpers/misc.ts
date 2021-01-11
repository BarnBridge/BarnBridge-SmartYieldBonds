import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';

export const toWei = (n: BNj | number): BN => {
  if (typeof n === 'number') {
    n = new BNj(n);
  }
  return BN.from(n.times(new BNj(10).pow(18)).toFixed(0).toString());
};

export const toBNj = (n: BN | number): BNj => {
  return new BNj(n.toString());
};

export const toBN = (n: BNj | number): BN => {
  return BN.from(n.toString());
};

export const e18 = (n: number | BN | BNj | string): BN => {
  if (n instanceof BN) {
    return n.mul(BN.from(10).pow(18));
  }

  if (n instanceof BNj) {
    return BN.from(
      n.times(new BNj(10).pow(18)).toFixed(0)
    );
  }

  return BN.from(n).mul(BN.from(10).pow(18));
};
