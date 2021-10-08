import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
  // Your type-safe config goes here
  networks: {

    // Needed for `solidity-coverage`
    coverage: {
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/yVzwGvPX6dd9TpUR4k4qWAk7ZliQcrWl',
        blockNumber: 12525794, //
      },
      allowUnlimitedContractSize: true,
      url: 'http://localhost:8555',
    },

    hardhat: {
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/yVzwGvPX6dd9TpUR4k4qWAk7ZliQcrWl',
        blockNumber: 12525794, //
      },
    },

    // Kovan 
    kovan: {
      url: 'https://kovan.infura.io/v3/INFURA-API-KEY-HERE',
      chainId: 42,
      accounts: {
        mnemonic: 'kovan test wallet mnemonic goes here get kovan eth from faucet first',
        path: 'm/44\'/60\'/0\'/0',
        initialIndex: 0,
        count: 10,
      },
      gas: 'auto',
      gasPrice: 1000000000, // 1 gwei
      gasMultiplier: 1.5,
    },

    // Mainnet
    mainnet: {
      url: 'https://mainnet.infura.io/v3/INFURA-API-KEY-HERE',
      chainId: 1,
      accounts: {
        mnemonic: 'mainnet deployments only, not required for mainnet forking tests',
        path: 'm/44\'/60\'/0\'/0',
        initialIndex: 1,
        count: 10,
      },
      gas: 'auto',
      gasPrice: 73000000000, // 1 gwei
      gasMultiplier: 1.5,
    },
  },
  // Use to verify contracts on Etherscan
  // https://buidler.dev/plugins/nomiclabs-buidler-etherscan.html
  etherscan: {
    apiKey: 'ETHERSCAN-API-KEY-HERE',
  },

};

export default config;

