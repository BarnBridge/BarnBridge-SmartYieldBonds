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

export const toBN = (n: BNj | number | BN): BN => {
  return BN.from(n.toString());
};

export const e = (n: number | BN | BNj | string, pow: number): BN => {
  if (n instanceof BN) {
    return n.mul(BN.from(10).pow(pow));
  }
  n = new BNj(n);
  return BN.from(
    n.times(new BNj(10).pow(18)).toFixed(0)
  );
};

export const e18 = (n: number | BN | BNj | string): BN => {
  return e(n, 18);
};

export const e18j = (n: number | BN | BNj | string): BNj => {
  if (n instanceof BN) {
    return new BNj(n.mul(BN.from(10).pow(18)).toString());
  }

  if (n instanceof BNj) {
    n.times(new BNj(10).pow(18));
  }

  return new BNj(n).times(new BNj(10).pow(18));;
};
