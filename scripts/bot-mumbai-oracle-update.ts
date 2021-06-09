import 'tsconfig-paths/register';
// -----

const smartYields = {
  // public testnet
  'USDC/aave/v1/testnetpub': '0xb74Ba15e2A9BF352661974eF6E52d510D48Dab47',
};

const harvestable = [
  'USDC/aave/v1/testnetpub',
];

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { getGasPriceWeb3, walletBalance, UpdaterFast, getProviderTestnet } from './lib/update';

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceWeb3;
  const providerGetter = getProviderTestnet;

  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());
  console.log('pools:');
  console.table(smartYields);

  const updater = new UpdaterFast(0.5, 60 * 10, BN.from(10), providerGetter, gasPriceGetter);
  await updater.initialize(smartYields, harvestable);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
