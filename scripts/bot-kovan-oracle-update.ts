import 'tsconfig-paths/register';
// -----

const smartYields = {
  // internal testnet
  'USDC/compound/v1/testnetint': '0x2327c862E8770E10f63EEF470686fFD2684A0092',
  'DAI/compound/v1/testnetint': '0xebF32075B5eE6e9aFf265D3Ec6C69A2b381B61B1',

  'DAI/aave/v1/testnetint': '0x17366088707195d5BFEec77196Ab1400d118bCa1',
  'USDC/aave/v1/testnetint': '0xEBc8cfd1A357BF0060f72871E96bEfaE5A629eCC',
  'USDT/aave/v1/testnetint': '0xE3D9c0ca18e6757E975b6F663811F207ec26c2B3',

  'USDC/cream/v1/testnetint': '0x53fFD02bDa592E89Fd5F2BA50685742d7B84d4D9',

  // public testnet
  'USDC/compound/v1/testnetpub': '0x63fD30ed07c91B7b27Da5c828c7eB752F7e4676b',
  'DAI/compound/v1/testnetpub': '0x3fc25d9e5a583E96E626D921660b5Ef6ecC8A19E',

  'USDC/cream/v1/testnetpub': '0xEd515cC6470f075bd32899dB8a42ddB75f43a4f1',

  'DAI/aave/v1/testnetpub': '0xc62441DE5dD50b4ee18265d5AD66FAAB2EEBc4Fe',
  'USDC/aave/v1/testnetpub': '0x7559E79fcFD34431bD3c6d9Cf82228477888E844',
  'USDT/aave/v1/testnetpub': '0x73d82Cd31CEe823B75E2078dbf16e11C7C174a6E',
};

const harvestable = [
  'DAI/aave/v1/testnetint', 'USDC/aave/v1/testnetint', 'USDT/aave/v1/testnetint',
  'DAI/aave/v1/testnetpub', 'USDC/aave/v1/testnetpub', 'USDT/aave/v1/testnetpub',
];

const smartAlphaUpkeep: SmartAlphaKeepers = [];

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { getGasPriceWeb3, walletBalance, UpdaterFast, getProvider, dumpRpcProviderUrls, SmartAlphaKeepers } from './lib/update';

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceWeb3;
  const providerGetter = getProvider;

  dumpRpcProviderUrls();
  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());
  console.log('SY pools:');
  console.table(smartYields);

  const updater = new UpdaterFast(0.5, 60 * 10, BN.from(10), providerGetter, gasPriceGetter);
  await updater.initialize(smartYields, harvestable, smartAlphaUpkeep);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
