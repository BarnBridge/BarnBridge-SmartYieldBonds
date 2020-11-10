import { BigNumber as BNj } from 'bignumber.js';

declare global {
  export namespace Chai {
    interface Assertion {
      equalWithin(toCheck: BNj, within: BNj): Promise<void>;
    }
  }
}
