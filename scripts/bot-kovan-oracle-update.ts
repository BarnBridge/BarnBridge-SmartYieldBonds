import 'tsconfig-paths/register';
// -----

const smartYields = {
  'USDC/compound/v1': '0x2327c862E8770E10f63EEF470686fFD2684A0092',
  'DAI/compound/v1': '0xebF32075B5eE6e9aFf265D3Ec6C69A2b381B61B1',
};

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { getGasPriceTest, walletBalance, Updater } from './lib/update';

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  const gasPriceGetter = getGasPriceTest;

  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet     :', walletSign.address);
  console.log('ETH balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price  :', (await gasPriceGetter()).toString());
  console.log('pools:');
  console.table(smartYields);

  const updater = new Updater(smartYields, walletSign, 50000, gasPriceGetter);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
