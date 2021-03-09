import { BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

export const A_HOUR = 60 * 60;
export const A_DAY = A_HOUR * 24;

export const TIME_IN_FUTURE = 2524608000; // Saturday, January 1, 2050 0:00:00

export const mineBlocks = async (blocks: number): Promise<void> => {
  const blockBefore = await ethers.provider.getBlock('latest');
  for (let f = 0; f < blocks; f++) {
    await ethers.provider.send('evm_mine', [blockBefore.timestamp + ((f + 1) * 15)]);
  }
};

export const forceNextTime = async (timeElapsed = 15): Promise<void> => {
  await ethers.provider.send('evm_increaseTime', [timeElapsed]);
};

export const forceTime = async (timeElapsed = 15): Promise<void> => {
  const blockBefore = await ethers.provider.getBlock('latest');
  await ethers.provider.send('evm_mine', [blockBefore.timestamp + timeElapsed]);
};

export const currentBlock = async () => {
  return await ethers.provider.getBlock('latest');
};

export const currentTime = async () => {
  return (await currentBlock()).timestamp;
};

export const autoMineOff = async () => {
  await ethers.provider.send('evm_setAutomine', [false]);
  await ethers.provider.send('evm_setIntervalMining', [0]);
};

export const autoMineOn = async () => {
  await ethers.provider.send('evm_setAutomine', [true]);
  await ethers.provider.send('evm_setIntervalMining', [5000]);
};

export const autoMineOnAddTime = async (timeElapsed: number) => {
  await forceTime(timeElapsed);
  await ethers.provider.send('evm_setAutomine', [true]);
  await ethers.provider.send('evm_setIntervalMining', [5000]);
};
