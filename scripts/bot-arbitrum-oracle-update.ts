import 'tsconfig-paths/register';
// -----

const smartYields = {};

const harvestable: string[] = [];

const smartAlphaUpkeep: SmartAlphaKeepers = [
  { address: '0x676c7d48ebd00735E082b0F1D11762C3Ff305072', epoch0: , epochDuration: 604800 },
];

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers, network } from 'hardhat';
import { walletBalance, UpdaterFast, dumpAllGasPricesBasic, getGasPriceBasic, getProvider, dumpRpcProviderUrls, SmartAlphaKeepers } from './lib/update';

async function main() {

  const DAYS_5 = 5 * 24 * 60 * 60; // 5 DAYS
  const harvestMin = BN.from(10).pow(18).mul(1);

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceBasic;
  const providerGetter = getProvider;

  dumpRpcProviderUrls();
  console.log('Starting YieldOracle.update() bot ...');
  console.log('network    :', network.name);
  console.log('gas prices :');
  await dumpAllGasPricesBasic();
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());

  console.log('SY pools:');
  console.table(smartYields);

  const updater = new UpdaterFast(0.7, DAYS_5, harvestMin, providerGetter, gasPriceGetter);
  await updater.initialize(smartYields, harvestable, smartAlphaUpkeep);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
