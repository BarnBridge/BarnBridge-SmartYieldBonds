import { ClockMock } from '@typechain/ClockMock';
import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';

export const START_TIME = 1614556800; // 03/01/2021 @ 12:00am (UTC)
let timePrev = BN.from(START_TIME);

export const moveTime = (clock: ClockMock) => {
  return async (seconds: number | BN | BNj): Promise<void> => {
    seconds = BN.from(seconds.toString());
    timePrev = timePrev.add(seconds);
    await clock.setCurrentTime(timePrev);
  };
};

export const currentTime = (): BN => {
  return timePrev;
};
