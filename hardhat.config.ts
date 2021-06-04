import defaults from './config';
import { task, HardhatUserConfig } from 'hardhat/config';

import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-web3';
import 'hardhat-typechain';
import 'hardhat-contract-sizer';
import 'hardhat-abi-exporter';

export interface IContract {
  name: string,
  addr: string,
  args: any[],
  skip: boolean,
}

const A_HOUR = 60 * 60;

const COMP = '0x61460874a7196d6a22d1ee4922473664b3e95270';
const cDAI = '0xf0d0eb522cfa50b716b3b1604c4f0fa6f04376ad';
const DAI = '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa';
const WETH = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
const cUSDC = '0x4a92e71227d294f041bd82dd8f78591b75140d63';
const USDC = '0xb7a4f3e9097c08da09517b5ab877f7a917224ede';

const dao = '0x59E2bC2E34EEeA09BfB99C2069Bfadf872D5F56f';

task('verify-testnet-compound-dai', 'verifies', async (args, hre) => {
  // CONF --------
  //   DAO: 0x88C072c6B78a05D8Bbd8629fE7CA88287e12B211
  // cDAI: 0xf0d0eb522cfa50b716b3b1604c4f0fa6f04376ad
  // COMP: 0x61460874a7196d6a22d1ee4922473664b3e95270
  // DAI: 0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa
  // WETH: 0xd0A1E359811322d97991E03f863a0C30C2cF029C
  // uniswapPath: [
  //   '0x61460874a7196d6a22d1ee4922473664b3e95270',
  //   '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  //   '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa'
  // ]
  //
  // DEPLOYED ----
  //   bondModel: 0x30434fC4b8ff2cDeB4B09490188Bf7E6d659CC4C
  // compoundProvider: 0x686b895Ff7c603cb7b5561E8e190685237a6B801
  // smartYield: 0x3fc25d9e5a583E96E626D921660b5Ef6ecC8A19E
  // seniorBond: 0x589B9d02Be40f67783edC1BA843A6a12A561243a
  // juniorBond: 0x3AC2E598E69E323893937fD396f5668566327549
  // controller: 0x7122e06a067a663B97155ccd34863D4cc7CdCD31
  // oracle: 0x04061dEBddEF431d06CbBC0b767C41e0DEEcb87a



  const uniswapPath = [COMP, WETH, DAI];

  const _bondModel = '0x30434fC4b8ff2cDeB4B09490188Bf7E6d659CC4C';
  const _compoundProvider = '0x686b895Ff7c603cb7b5561E8e190685237a6B801';
  const _smartYield = '0x3fc25d9e5a583E96E626D921660b5Ef6ecC8A19E';
  const _controller = '0x7122e06a067a663B97155ccd34863D4cc7CdCD31';
  const seniorBondCONF = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
  const juniorBondCONF = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
  const juniorTokenCONF = { name: 'BarnBridge cDAI', symbol: 'bb_cDAI' };
  const oracleCONF = { windowSize: A_HOUR, granularity: 4 };
  const decimals = 18; // same as DAI

  const contracts: IContract[] = [
    {
      name: 'bond model',
      addr: _bondModel,
      args: [],
      skip: false,
    },
    {
      name: 'cDAI provider',
      addr: _compoundProvider,
      args: [cDAI],
      skip: false,
    },
    {
      name: 'smartYield',
      addr: _smartYield,
      args: [juniorTokenCONF.name, juniorTokenCONF.symbol, hre.ethers.BigNumber.from(decimals)],
      skip: false,
    },
    {
      name: 'seniorBond',
      addr: '0x589B9d02Be40f67783edC1BA843A6a12A561243a',
      args: [ _smartYield, seniorBondCONF.name, seniorBondCONF.symbol],
      skip: false,
    },
    {
      name: 'juniorBond',
      addr: '0x3AC2E598E69E323893937fD396f5668566327549',
      args: [_smartYield, juniorBondCONF.name, juniorBondCONF.symbol],
      skip: false,
    },
    {
      name: 'controller',
      addr: _controller,
      args: [_compoundProvider, _smartYield, _bondModel, uniswapPath],
      skip: false,
    },
    {
      name: 'oracle',
      addr: '0x04061dEBddEF431d06CbBC0b767C41e0DEEcb87a',
      args: [_controller, oracleCONF.windowSize, oracleCONF.granularity],
      skip: false,
    },
  ];

  for (const c of contracts) {
    console.log('verifying', c.name, '...');
    if(c.skip) {
      console.log('skipping');
    } else {
      await hre.run('verify:verify', {
        address: c.addr,
        constructorArguments: c.args,
      });
    }
  }
});

task('verify-testnet-compound-usdc', 'verifies', async (args, hre) => {
  // CONF --------
  //   DAO: 0x88C072c6B78a05D8Bbd8629fE7CA88287e12B211
  // cUSDC: 0x4a92e71227d294f041bd82dd8f78591b75140d63
  // COMP: 0x61460874a7196d6a22d1ee4922473664b3e95270
  // USDC: 0xb7a4f3e9097c08da09517b5ab877f7a917224ede
  // WETH: 0xd0A1E359811322d97991E03f863a0C30C2cF029C
  // uniswapPath: [
  //   '0x61460874a7196d6a22d1ee4922473664b3e95270',
  //   '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
  //   '0xb7a4f3e9097c08da09517b5ab877f7a917224ede'
  // ]
  //
  // DEPLOYED ----
  //   bondModel: 0xd815d5fe0f2f394Aa313441d1a9fF849e59C76c8
  // compoundProvider: 0x2894fd23f5604DE8fBfC6Fb91BC7224CC93fa135
  // smartYield: 0x63fD30ed07c91B7b27Da5c828c7eB752F7e4676b
  // seniorBond: 0x7Baa74D3091fA1d0FE2d05046EF4C9789b4451a3
  // juniorBond: 0xD0219B2B4B5C26C90C6A73D10DCeCB52BE20885b
  // controller: 0x7A40EC780E57134bB0d2Ed8d54C2BD0A815B85CC
  // oracle: 0xe23E7531D0431c4bcA46ac84862849f647646968


  const uniswapPath = [COMP, WETH, USDC];

  const _bondModel = '0xd815d5fe0f2f394Aa313441d1a9fF849e59C76c8';
  const _compoundProvider = '0x2894fd23f5604DE8fBfC6Fb91BC7224CC93fa135';
  const _smartYield = '0x63fD30ed07c91B7b27Da5c828c7eB752F7e4676b';
  const _controller = '0x7A40EC780E57134bB0d2Ed8d54C2BD0A815B85CC';
  const seniorBondCONF = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
  const juniorBondCONF = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
  const juniorTokenCONF = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };
  const oracleCONF = { windowSize: A_HOUR, granularity: 4 };
  const decimals = 6;

  const contracts: IContract[] = [
    {
      name: 'bond model',
      addr: _bondModel,
      args: [],
      skip: true,
    },
    {
      name: 'cUSDC provider',
      addr: _compoundProvider,
      args: [cUSDC],
      skip: true,
    },
    {
      name: 'smartYield',
      addr: _smartYield,
      args: [juniorTokenCONF.name, juniorTokenCONF.symbol, hre.ethers.BigNumber.from(decimals)],
      skip: true,
    },
    {
      name: 'seniorBond',
      addr: '0x7Baa74D3091fA1d0FE2d05046EF4C9789b4451a3',
      args: [ _smartYield, seniorBondCONF.name, seniorBondCONF.symbol],
      skip: true,
    },
    {
      name: 'juniorBond',
      addr: '0xD0219B2B4B5C26C90C6A73D10DCeCB52BE20885b',
      args: [_smartYield, juniorBondCONF.name, juniorBondCONF.symbol],
      skip: true,
    },
    {
      name: 'controller',
      addr: _controller,
      args: [_compoundProvider, _smartYield, _bondModel, uniswapPath],
      skip: true,
    },
    {
      name: 'oracle',
      addr: '0xe23E7531D0431c4bcA46ac84862849f647646968',
      args: [_controller, oracleCONF.windowSize, oracleCONF.granularity],
      skip: true,
    },
  ];

  for (const c of contracts) {
    console.log('verifying', c.name, '...');
    if(c.skip) {
      console.log('skipping');
    } else {
      await hre.run('verify:verify', {
        address: c.addr,
        constructorArguments: c.args,
      });
    }
  }
});

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
    version: '0.7.6',
    settings: {
      optimizer: {
        enabled: true,
        runs: 9999,
      },
    },
  },

  gasReporter: {
    currency: 'USD',
    enabled: false,
  },

  abiExporter: {
    path: './abi',
    clear: true,
    flat: false,
    only: [
      'SmartYield', 'SeniorBond', 'JuniorBond', 'YieldOracle', 'BondModelV1',
      'CompoundProvider', 'CompoundController',
    ],
  },

};

export default config;
