import { BigNumber as BNj } from 'bignumber.js';
import { BigNumber as BN } from 'ethers';

declare global {
  export namespace Chai {
    interface Assertion {
      equalWithin(toCheck_: BN, within: BNj, message?: string | undefined): Promise<void>;
      equalOrLowerWithin(toCheck_: BN, within: BNj, message?: string | undefined): Promise<void>;
    }
  }
}
