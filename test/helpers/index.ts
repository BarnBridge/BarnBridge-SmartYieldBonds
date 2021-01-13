import { Assertion } from 'chai';
import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

export const ERROR_MARGIN_PREFERED = new BNj(1).div(new BNj(10).pow(10));  // 0.00000001 %
export const ERROR_MARGIN_OKISH = new BNj(12).div(new BNj(10).pow(6)); // 0.0015 % => compounds to an error of ~0.3% in 365 rounds of compounding (a year)
export const ERROR_MARGIN_BAD = new BNj(5).div(new BNj(10).pow(4)); // 0.05 % => compounds to an error of ~10% in 365 rounds of compounding (a year)

export const MAX_UINT256 = BN.from(2).pow(256).sub(1);

export const A_DAY = 60 * 60 * 24;

// see /types.d.ts
Assertion.addMethod('equalWithin', function (expected: BN, within: BNj, message: string | undefined = undefined) {
  new Assertion(this._obj).to.be.instanceof(BN, message);

  const obj = new BNj((this._obj as BN).toString());
  const toCheck = new BNj(expected.toString());
  const diff = obj.minus(toCheck).abs();

  this.assert(
    diff.eq(0) || diff.div(obj).lt(within)
    , `${message !== undefined ? message + ' : ' : ''}expected ${obj.toFixed(18)} to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}. Actually: ${diff.div(obj).toFixed(18)}`
    , `${message !== undefined ? message + ' : ' : ''}expected ${obj.toFixed(18)} not to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}. Actually: ${diff.div(obj).toFixed(18)}`
    , expected.toString()        // expected
    , (this._obj as BN).toString()   // actual
    , true
  );
});

Assertion.addMethod('equalOrLowerWithin', function (expected: BN, within: BNj, message: string | undefined = undefined) {
  new Assertion(this._obj).to.be.instanceof(BN, message);

  const obj = new BNj((this._obj as BN).toString());
  const toCheck = new BNj(expected.toString());
  const diff = obj.minus(toCheck).abs();

  console.error('OBJ=', obj.toFixed(18));
  console.error('CHK=', toCheck.toFixed(18));

  new Assertion(obj.lte(toCheck)).to.equal(true, `${message !== undefined ? message + ' : ' : ''}not lower or equal`);

  this.assert(
    diff.eq(0) || diff.div(obj).lt(within)
    , `${message !== undefined ? message + ' : ' : ''}expected ${obj.toFixed(18)} to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}. Actually: ${diff.div(obj).toFixed(18)}`
    , `${message !== undefined ? message + ' : ' : ''}expected ${obj.toFixed(18)} not to be within ${within.toFixed(18)} of ${toCheck.toFixed(18)}. Actually: ${diff.div(obj).toFixed(18)}`
    , expected.toString()        // expected
    , (this._obj as BN).toString()   // actual
    , true
  );
});

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
