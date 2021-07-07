import 'tsconfig-paths/register';

import { deployAaveController, deployAaveProvider, deployBondModelV2Linear, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';

const A_HOUR = 60 * 60;
const A_DAY = A_HOUR * 24;

const seniorBondCONF = { name: 'BarnBridge amUSDT sBOND', symbol: 'bb_sBOND_amUSDT' };
const juniorBondCONF = { name: 'BarnBridge amUSDT jBOND', symbol: 'bb_jBOND_amUSDT' };
const juniorTokenCONF = { name: 'BarnBridge junior amUSDT', symbol: 'bb_amUSDT' };

const oracleCONF = { windowSize: 3 * A_DAY, granularity: 4 };

// barnbridge
const decimals = 6; // same as USDT
const feesOwner = '0x2D55369b2e04AFeFf55b56E782A7D9206DFFA591';

// externals ---

// aave
const amUSDT = '0x60D55F02A771d515e077c9C2403a1ef324885CeC';

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModelV2Linear(deployerSign);
  const pool = await deployAaveProvider(deployerSign, amUSDT);

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
  console.log('amUSDT:', amUSDT);
  console.log('feesOwner', feesOwner);
  console.log('');
  console.log('DEPLOYED ----');
  console.log('bondModel:', bondModel.address);
  console.log('provider:', pool.address, '[', amUSDT, ']');
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
