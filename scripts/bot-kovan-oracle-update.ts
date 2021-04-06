import 'tsconfig-paths/register';
// -----

const smartYields = {
  'USDC/compound/v1': '0x2327c862E8770E10f63EEF470686fFD2684A0092',
  'DAI/compound/v1': '0xebF32075B5eE6e9aFf265D3Ec6C69A2b381B61B1',
};

// -----
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { Updater } from './lib/update';

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet:', walletSign.address);

  const updater = new Updater(smartYields, walletSign, 1000);

  await updater.updateLoop();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(-1);
  });
