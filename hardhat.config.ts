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
  //   DAO: 0x59E2bC2E34EEeA09BfB99C2069Bfadf872D5F56f
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
  // bondModel: 0x8F5f8305e9938d41D554Ce3aa2C1a1b4F3D083BE
  // compoundProvider: 0x604E186dB4184c92dd99B70123FA9BCa438b22C6
  // smartYield: 0x399Af1a435EF3bc010249F79Ee2c078909d25521
  // seniorBond: 0xBb34c435e7102597464963ec168c6a4Fc33430Aa
  // juniorBond: 0x929d73A2A7318E470e6755523D8591eE80b5D1CA
  // controller: 0x48294217f607CEB83c29d6dC0C733fa33e9eEE4E
  // oracle: 0x47F0B7d1C21D3c8660DEcb8d096c63c566C5496D


  const uniswapPath = [COMP, WETH, DAI];

  const _bondModel = '0x8F5f8305e9938d41D554Ce3aa2C1a1b4F3D083BE';
  const _compoundProvider = '0x604E186dB4184c92dd99B70123FA9BCa438b22C6';
  const _smartYield = '0x399Af1a435EF3bc010249F79Ee2c078909d25521';
  const _controller = '0x48294217f607CEB83c29d6dC0C733fa33e9eEE4E';
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
      skip: true,
    },
    {
      name: 'cDAI provider',
      addr: _compoundProvider,
      args: [cDAI],
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
      addr: '0xBb34c435e7102597464963ec168c6a4Fc33430Aa',
      args: [ _smartYield, seniorBondCONF.name, seniorBondCONF.symbol],
      skip: true,
    },
    {
      name: 'juniorBond',
      addr: '0x929d73A2A7318E470e6755523D8591eE80b5D1CA',
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
      addr: '0x47F0B7d1C21D3c8660DEcb8d096c63c566C5496D',
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

task('verify-testnet-compound-usdc', 'verifies', async (args, hre) => {
  // CONF --------
  // DAO: 0x59E2bC2E34EEeA09BfB99C2069Bfadf872D5F56f
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
  //   bondModel: 0x39ebBA61056D47ea7E961fBD56445A5bD02aea83
  // compoundProvider: 0x10cB42ef8EC4E3c79A5150F9B38B2f4381838c3E
  // smartYield: 0xb74Ba15e2A9BF352661974eF6E52d510D48Dab47
  // seniorBond: 0x84Aa759082C660de2FC4Fa905a1c599e3eeFCcD0
  // juniorBond: 0xCf7e717EF904EAb9023c7b16779C7a08527Ac37e
  // controller: 0xf5BF9558E26c68bcEC10AAb9BbD9d824C3607F7D
  // oracle: 0x3E03F2351Bf77fc79d3D91ac603349a67D272aeF

  const uniswapPath = [COMP, WETH, USDC];

  const _bondModel = '0x39ebBA61056D47ea7E961fBD56445A5bD02aea83';
  const _compoundProvider = '0x10cB42ef8EC4E3c79A5150F9B38B2f4381838c3E';
  const _smartYield = '0xb74Ba15e2A9BF352661974eF6E52d510D48Dab47';
  const _controller = '0xf5BF9558E26c68bcEC10AAb9BbD9d824C3607F7D';
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
      addr: '0x84Aa759082C660de2FC4Fa905a1c599e3eeFCcD0',
      args: [ _smartYield, seniorBondCONF.name, seniorBondCONF.symbol],
      skip: false,
    },
    {
      name: 'juniorBond',
      addr: '0xCf7e717EF904EAb9023c7b16779C7a08527Ac37e',
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
      addr: '0x3E03F2351Bf77fc79d3D91ac603349a67D272aeF',
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
