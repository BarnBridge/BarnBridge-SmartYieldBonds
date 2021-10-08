import 'tsconfig-paths/register';
// -----

const smartYields = {
  // aave
  'DAI/aave/v1': '0xDAA037F99d168b552c0c61B7Fb64cF7819D78310',
  'USDC/aave/v1': '0x7d0BdcDF61655d2eF3D339D2B15421f4F6A28D2f',
  'USDT/aave/v1': '0x18efBF54e18efbdd55e94176C65959864efc7D8e',
};

const harvestable = [
  'USDC/aave/v1', 'USDT/aave/v1', 'DAI/aave/v1',
];

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers, network } from 'hardhat';
import { walletBalance, UpdaterFast, getGasPricePolygon, dumpAllGasPricesPolygon, getProvider, dumpRpcProviderUrls } from './lib/update';

async function main() {

  const DAYS_5 = 5 * 24 * 60 * 60; // 5 DAYS
  const harvestMin = BN.from(10).pow(18).mul(1);

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPricePolygon;
  const providerGetter = getProvider;

  dumpRpcProviderUrls();
  console.log('Starting YieldOracle.update() bot ...');
  console.log('network    :', network.name);
  console.log('gas prices :');
  await dumpAllGasPricesPolygon();
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
