import defaults from './config';
import { task, HardhatUserConfig } from 'hardhat/config';

import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-typechain';

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(await account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  ...defaults,

  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },

  gasReporter: {
    currency: 'USD',
    enabled: true,
  },
};

export default config;
