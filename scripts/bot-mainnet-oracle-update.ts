import 'tsconfig-paths/register';
// -----

const smartYields = {
  'USDC/compound/v1': '0x4B8d90D68F26DEF303Dcb6CFc9b63A1aAEC15840',
  'DAI/compound/v1': '0x673f9488619821aB4f4155FdFFe06f6139De518F',
};

const gasStationUrl = process.env.GAS_STATION_URL;

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { walletBalance, Updater, getGasPriceMainnet, dumpAllGasPrices } from './lib/update';

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceMainnet;

  console.log('Starting YieldOracle.update() bot ...');
  console.log('gas prices :');
  await dumpAllGasPrices();
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());

  console.log('pools:');
  console.table(smartYields);

  const updater = new Updater(smartYields, walletSign, 50000, gasPriceGetter);

  //await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
