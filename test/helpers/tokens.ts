import { Erc20Mock } from '@typechain/Erc20Mock';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundProvider } from '@typechain/CompoundProvider';

import { BigNumber as BN, Signer, Wallet } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { toBN } from './misc';
import { TIME_IN_FUTURE } from './time';

export const buyTokens = (smartYield: SmartYield, pool: CompoundProvider, underlying: Erc20Mock) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.mintMock(user.address, amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await smartYield.connect(user).buyTokens(amountUnderlying, 1, TIME_IN_FUTURE, { gasLimit: 2_000_000 });
  };
};

export const sellTokens = (smartYield: SmartYield, pool: CompoundProvider) => {
  return async (user: Wallet, amountTokens: number | BN): Promise<void> => {
    amountTokens = toBN(amountTokens);
    await smartYield.connect(user).approve(smartYield.address, amountTokens);
    await smartYield.connect(user).sellTokens(amountTokens, 0, TIME_IN_FUTURE, { gasLimit: 2_000_000 });
  };
};
