import { Assertion } from 'chai';
import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

// see /types.d.ts
Assertion.addMethod('equalWithin', function (toCheck: BNj, within: BNj) {
  new Assertion(this._obj).to.be.instanceof(BN);

  const obj = new BNj((this._obj as BN).toString());
  const errorMargin = (obj.gt(toCheck) ? obj.minus(toCheck) : toCheck.minus(obj)).div(toCheck);

  this.assert(
    errorMargin.abs().lt(within)
    , `expected ${obj.toFixed(18)} to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}`
    , `expected ${obj.toFixed(18)} not to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}`
    , within.toFixed(18)        // expected
    , errorMargin.abs().toFixed(18)   // actual
  );
});

export const ERROR_MARGIN_PREFERED = new BNj(1).div(new BNj(10).pow(10));  // 0.00000001 %
export const ERROR_MARGIN_ACCEPTABLE = new BNj(5).div(new BNj(10).pow(4)); // 0.05 %

export const getBlockNumber = async (): Promise<number> => {
  return await ethers.provider.getBlockNumber();
};

export const getBlockTimestamp = async (): Promise<number> => {
  const block = await ethers.provider.getBlock('latest');
  return block.timestamp;
};

export const addBlockTimestamp = async (interval: number): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [interval]);
};

export const mineBySeconds = async (interval: number): Promise<void> => {
  await addBlockTimestamp(interval);
  await ethers.provider.send('evm_mine', []);
  const block = await ethers.provider.getBlock('latest');
  console.error(`block.number=${block.number}, block.timestamp=${block.timestamp}`);
};

export const blockDump = async (): Promise<void> => {
  const block = await ethers.provider.getBlock('latest');
  console.error(`[DEBUG]: block.number=${block.number}, block.timestamp=${block.timestamp}`);
};

export * from './misc';
export * from './rates';
