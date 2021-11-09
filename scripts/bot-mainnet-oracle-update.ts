import 'tsconfig-paths/register';
// -----

const smartYields = {
  // compound
  'USDC/compound/v1': '0x4B8d90D68F26DEF303Dcb6CFc9b63A1aAEC15840',
  'DAI/compound/v1': '0x673f9488619821aB4f4155FdFFe06f6139De518F',
  'USDT/compound/v1': '0x3E3349E43e5EeaAEDC5Dc2cf7e022919a6751907',

  // cream
  // 'USDC/cream/v1': '0x62e479060c89C48199FC7ad43b1432CC585BA1b9',
  // 'DAI/cream/v1': '0x89d82FdF095083Ded96B48FC6462Ed5dBD14151f',
  // 'USDT/cream/v1': '0xc45F49bE156888a1C0C93dc0fE7dC89091E291f5',

  // aave
  'USDC/aave/v1': '0x3cf46DA7D65E9aa2168a31b73dd4BeEA5cA1A1f1',
  'USDT/aave/v1': '0x660dAF6643191cF0eD045B861D820F283cA078fc',
  'DAI/aave/v1': '0x6c9DaE2C40b1e5883847bF5129764e76Cb69Fc57',
  'GUSD/aave/v1': '0x6324538cc222b43490dd95CEBF72cf09d98D9dAe',
  'RAI/aave/v1': '0x4dB6fb0218cE5DA392f1E6475A554BAFcb62EF30',
  'SUSD/aave/v1': '0xEc810FDd49e756fB7Ce87DC9D53C7cAB58EAB4Ce',
  'FEI/aave/v1': '0xA3abb32c657adA8803bF6AEEF6Eb42B29c74bf28',
};

const harvestable = [
  'USDC/aave/v1', 'USDT/aave/v1', 'DAI/aave/v1', 'GUSD/aave/v1', 'RAI/aave/v1', 'SUSD/aave/v1',
];

const smartAlphaUpkeep: SmartAlphaKeepers = [
  { address: '0xb25a05A38E5e2201dD6E813396e223532Ec4dC0D', epoch0: 1631541600, epochDuration: 604800 },
];

const gasStationUrl = process.env.GAS_STATION_URL;

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { walletBalance, UpdaterFast, getGasPriceMainnet, dumpAllGasPrices, getProvider, dumpRpcProviderUrls, SmartAlphaKeepers } from './lib/update';

async function main() {

  const DAYS_5 = 5 * 24 * 60 * 60;
  const harvestMin = BN.from(10).pow(18).mul(1);

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceMainnet;
  const providerGetter = getProvider;

  dumpRpcProviderUrls();
  console.log('Starting YieldOracle.update() bot ...');
  console.log('gas prices :');
  await dumpAllGasPrices();
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
