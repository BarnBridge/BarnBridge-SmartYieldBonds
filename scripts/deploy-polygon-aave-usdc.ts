import 'tsconfig-paths/register';

import { deployAaveController, deployAaveProvider, deployBondModelV2Linear, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';

const A_HOUR = 60 * 60;
const A_DAY = A_HOUR * 24;

const seniorBondCONF = { name: 'BarnBridge amUSDC sBOND', symbol: 'bb_sBOND_amUSDC' };
const juniorBondCONF = { name: 'BarnBridge amUSDC jBOND', symbol: 'bb_jBOND_amUSDC' };
const juniorTokenCONF = { name: 'BarnBridge junior amUSDC', symbol: 'bb_amUSDC' };

const oracleCONF = { windowSize: 3 * A_DAY, granularity: 4 };

// barnbridge
const decimals = 6; // same as USDC
const feesOwner = '0x2D55369b2e04AFeFf55b56E782A7D9206DFFA591';

// externals ---

// aave
const amUSDC = '0x1a13F4Ca1d028320A707D99520AbFefca3998b7F';

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModelV2Linear(deployerSign);
  const pool = await deployAaveProvider(deployerSign, amUSDC);

  const smartYield = await deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals));

  const seniorBond = await deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
  const juniorBond = await deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);

  const controller = await deployAaveController(deployerSign, pool.address, smartYield.address, bondModel.address, deployerSign.address);

  const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

  await controller.setOracle(oracle.address);
  await controller.setFeesOwner(feesOwner);
  await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
  await pool.setup(smartYield.address, controller.address);

  await controller.setBondLifeMax(365);
  await controller.setFeeBuyJuniorToken(BN.from('5000000000000000'));
  await controller.setFeeRedeemSeniorBond(BN.from('50000000000000000'));

  console.log('CONF --------');
  console.log('amUSDC:', amUSDC);
  console.log('feesOwner', feesOwner);
  console.log('');
  console.log('DEPLOYED ----');
  console.log('bondModel:', bondModel.address);
  console.log('provider:', pool.address, '[', amUSDC, ']');
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
