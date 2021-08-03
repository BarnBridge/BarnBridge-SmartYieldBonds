import 'tsconfig-paths/register';
// -----

const smartYields = {
  //idle
  'USDC/idle/by/v1': '0x5274891bEC421B39D23760c04A6755eCB444797C',
  'USDT/idle/by/v1': '0xF34842d05A1c888Ca02769A633DF37177415C2f8',
  'DAI/idle/by/v1': '0x3fE7940616e5Bc47b0775a0dccf6237893353bB4',

  'USDC/idle/ra/v1': '0x3391bc034f2935eF0E1e41619445F998b2680D35',
  'USDT/idle/ra/v1': '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5',
  'DAI/idle/ra/v1': '0xa14eA0E11121e6E951E87c66AFe460A00BCD6A16'
};

const harvestable = [
  'USDC/idle/by/v1', 'USDT/idle/by/v1', 'DAI/idle/by/v1',
  'USDC/idle/ra/v1', 'USDT/idle/ra/v1', 'DAI/idle/ra/v1'
];

const gasStationUrl = process.env.GAS_STATION_URL;

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { walletBalance, UpdaterFast, getGasPriceMainnet, dumpAllGasPrices, getProviderMainnet } from './lib/update';

async function main() {

  const DAYS_5 = 5 * 24 * 60 * 60;
  const harvestMin = BN.from(10).pow(18).mul(1);

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceMainnet;
  const providerGetter = getProviderMainnet;

  console.log('Starting YieldOracle.update() bot ...');
  console.log('gas prices :');
  await dumpAllGasPrices();
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());

  console.log('pools:');
  console.table(smartYields);

  const updater = new UpdaterFast(0.7, DAYS_5, harvestMin, providerGetter, gasPriceGetter);
  await updater.initialize(smartYields, harvestable);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
