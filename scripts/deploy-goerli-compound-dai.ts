import 'tsconfig-paths/register';

import { deployBondModelV2Compounded, deployCreamController, deployCreamProvider, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { IERC20Factory } from '@typechain/IERC20Factory';

/**
 * !!!! DEPLOYS CREAM CONTROLLER/PROVIDER ON TOP OF COMPOUND - SINCE GOERLY DOESNT HAVE COMP MARKETS
 */

const A_HOUR = 60 * 60;

const seniorBondCONF = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
const juniorBondCONF = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
const juniorTokenCONF = { name: 'BarnBridge cDAI', symbol: 'bb_cDAI' };

const oracleCONF = { windowSize: 2 * A_HOUR, granularity: 2 };

// barnbridge
const decimals = 18; // same as DAI
const dao = '0x95a9310102C0C33f8a5bE5Ba061b0A2f146cDC07';
const feesOwner = dao;

// externals ---

// compound
const cDAI = '0x822397d9a55d0fefd20f5c4bcab33c5f65bd28eb';

const DAI = '0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60';

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModelV2Compounded(deployerSign);
  const pool = await deployCreamProvider(deployerSign, cDAI);

  const smartYield = await deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals));
  const seniorBond = await deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
  const juniorBond = await deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);

  const controller = await deployCreamController(deployerSign, pool.address, smartYield.address, bondModel.address, feesOwner);
  const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

  await controller.setOracle(oracle.address);
  await controller.setFeesOwner(feesOwner);
  await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
  await pool.setup(smartYield.address, controller.address);

  await controller.setGuardian(dao);
  await controller.setDao(dao);

  console.log('CONF --------');
  console.log('DAO:', dao);
  console.log('cDAI:', cDAI);
  console.log('DAI:', DAI);
  console.log('');
  console.log('DEPLOYED ----');
  console.log('DEPLOYED ----');
  console.log('bondModel:', bondModel.address);
  console.log('provider:', pool.address, '[', cDAI, ']');
  console.log('smartYield:', smartYield.address, '[', juniorTokenCONF.name, juniorTokenCONF.symbol, decimals, ']');
  console.log('seniorBond:', seniorBond.address, '[', smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol, ']');
  console.log('juniorBond:', juniorBond.address, '[', smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol, ']');
  console.log('controller:', controller.address, '[', pool.address, smartYield.address, bondModel.address, deployerSign.address, ']');
  console.log('oracle:', oracle.address, '[', controller.address, oracleCONF.windowSize, oracleCONF.granularity, ']');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
