import 'tsconfig-paths/register';
// -----

const smartYields = {
  // compound
  'USDC/compound/v1': '0x4B8d90D68F26DEF303Dcb6CFc9b63A1aAEC15840',
  'DAI/compound/v1': '0x673f9488619821aB4f4155FdFFe06f6139De518F',

  // cream
  'USDC/cream/v1': '0x62e479060c89C48199FC7ad43b1432CC585BA1b9',
  'DAI/cream/v1': '0x89d82FdF095083Ded96B48FC6462Ed5dBD14151f',
  'USDT/cream/v1': '0xc45F49bE156888a1C0C93dc0fE7dC89091E291f5',

  // aave
  'USDC/aave/v1': '0x3cf46DA7D65E9aa2168a31b73dd4BeEA5cA1A1f1',
  'USDT/aave/v1': '0x660dAF6643191cF0eD045B861D820F283cA078fc',
  'DAI/aave/v1': '0x6c9DaE2C40b1e5883847bF5129764e76Cb69Fc57',
  'GUSD/aave/v1': '0x6324538cc222b43490dd95CEBF72cf09d98D9dAe',
};

const gasStationUrl = process.env.GAS_STATION_URL;

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { walletBalance, UpdaterFast, getGasPriceMainnet, dumpAllGasPrices, getProviderMainnet } from './lib/update';

async function main() {

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

  const updater = new UpdaterFast(0.7, providerGetter, gasPriceGetter);
  await updater.initialize(smartYields);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
