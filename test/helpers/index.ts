import { Assertion } from 'chai';
import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';

// see /types.d.ts
Assertion.addMethod('equalWithin', function (toCheck: BNj, within: BNj) {
  new Assertion(this._obj).to.be.instanceof(BN);

  const obj = new BNj((this._obj as BN).toString());
  const errorMargin = (obj.gt(toCheck) ? obj.minus(toCheck) : toCheck.minus(obj)).div(toCheck);

  this.assert(
    errorMargin.abs().lt(within)
    , `expected #{this} to be within #{exp} but got withing #{act} (v=${toCheck.toString()})`
    , `expected #{this} to not be within #{exp} but got withing #{act} (v=${toCheck.toString()})`
    , within.toString()        // expected
    , errorMargin.abs().toString()   // actual
  );
});

export const OK_ERROR_MARGIN = new BNj(1).div(new BNj(10).pow(10)); // 0.0000001 %

export * from './misc';
export * from './rates';
