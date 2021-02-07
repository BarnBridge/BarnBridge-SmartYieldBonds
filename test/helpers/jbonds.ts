import { CompoundProviderMock } from '@typechain/CompoundProviderMock';
import { SmartYield } from '@typechain/SmartYield';

import { BigNumber as BN, Signer, Wallet } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { e18, toBN, toBNj } from './misc';
import { currentTime } from './time';

export const buyJuniorBond = (smartYield: SmartYield, pool: CompoundProviderMock) => {
  return async (user: Wallet, tokenAmount: number | BN, maxMaturesAt: number | BN): Promise<void> => {
    tokenAmount = toBN(tokenAmount);
    maxMaturesAt = toBN(maxMaturesAt);
    await smartYield.connect(user).approve(user.address, tokenAmount);
    await smartYield.connect(user).buyJuniorBond(tokenAmount, maxMaturesAt, currentTime().add(1));
  };
};

export const redeemJuniorBond = (smartYield: SmartYield) => {
  return async (user: Wallet, id: number | BN): Promise<void> => {
    id = toBN(id);
    await smartYield.connect(user).redeemJuniorBond(id);
  };
};
