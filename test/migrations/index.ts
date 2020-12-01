import { createFixtureLoader, Fixture } from 'ethereum-waffle';
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';

let loadFixture: ReturnType<typeof createFixtureLoader>;

export const bbFixtures = async <T>(fixture: Fixture<T>): Promise<T> => {
  if (!loadFixture) {
    loadFixture = await createFixtureLoader((await ethers.getSigners()) as unknown as Wallet[], ethers.provider as unknown as any);
  }
  return await loadFixture<T>(fixture);
};
