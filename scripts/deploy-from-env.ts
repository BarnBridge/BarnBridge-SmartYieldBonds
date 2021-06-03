import 'tsconfig-paths/register';

import { deployBondModel, deployCompoundController, deployCompoundProvider, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';
require('dotenv').config();

const A_HOUR = 60 * 60;
const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

// BarnBridge Governance Contract
const dao = process.env.DAO;
const feesOwner = dao;

// Decimal Places
const decimals_usdc = 6; // same as USDC
const decimals_dai = 18; // same as DAI

// External Token Addresses
const USDC = process.env.USDC;
const WETH = process.env.WETH;
const DAI = process.env.DAI;

// Provider Tokens
const cUSDC = process.env.CUSDC;
const cDAI = process.env.CDAI;
const COMP = process.env.COMP;

// UniSwap Mappings
const uniswapPath_cUSDC = [COMP, WETH, USDC];
const uniswapPath_cDAI = [COMP, WETH, DAI];

// Compound USDC Symbol Mappings
const seniorBondCONF_cUSDC = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
const juniorBondCONF_cUSDC = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
const juniorTokenCONF_cUSDC = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };

// Compound DAI Symbol Mappings
const seniorBondCONF_cDAI = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
const juniorBondCONF_cDAI  = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
const juniorTokenCONF_cDAI  = { name: 'BarnBridge cDAI', symbol: 'bb_cDAI' };


async function main() {

  console.log('BarnBridge DAO:', dao);
  console.log('External Contract Configuration:');
  console.log('COMP:', COMP);
  console.log('USDC:', USDC);
  console.log('WETH:', WETH);
  console.log('DAI:', DAI);
  console.log('cUSDC:', cUSDC);
  console.log('cDAI:', cDAI);

  console.log('UniSwap Path Mappings');
  console.log('uniswapPath_cUSDC:', uniswapPath_cUSDC);
  console.log('uniswapPath_cDAI:', uniswapPath_cDAI);
  
  const bondModel = await deployBondModel(deployerSign);
  console.log('bondModel:', bondModel.address);

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];
  console.log('Deployers:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  // Compound USDC
  const pool_cUSDC = await deployCompoundProvider(deployerSign, cUSDC);
  const smartYield_cUSDC = await deploySmartYield(deployerSign, juniorTokenCONF_cUSDC.name, juniorTokenCONF_cUSDC.symbol, BN.from(decimals_usdc));
  const seniorBond_cUSDC = await deploySeniorBond(deployerSign, smartYield_cUSDC.address, seniorBondCONF_cUSDC.name, seniorBondCONF_cUSDC.symbol);
  const juniorBond_cUSDC = await deployJuniorBond(deployerSign, smartYield_cUSDC.address, juniorBondCONF_cUSDC.name, juniorBondCONF_cUSDC.symbol);
  const controller_cUSDC = await deployCompoundController(deployerSign, pool_cUSDC.address, smartYield_cUSDC.address, bondModel.address, uniswapPath_cUSDC);
  const oracle_cUSDC = await deployYieldOracle(deployerSign, controller_cUSDC.address, oracleCONF.windowSize, oracleCONF.granularity);
  await controller_cUSDC.setOracle(oracle.address);
  await controller_cUSDC.setFeesOwner(feesOwner);
  await smartYield_cUSDC.setup(controller_cUSDC.address, pool.address, seniorBond.address, juniorBond.address);
  await pool_cUSDC.setup(smartYield_cUSDC.address, controller_cUSDC.address);
  await controller_cUSDC.setGuardian(dao);
  await controller_cUSDC.setDao(dao);
  console.log('----- Compound USDC SmartYield DEPLOYED ----');
  console.log('compoundProvider_cUSDC:', pool_cUSDC.address);
  console.log('smartYield_cUSDC:', smartYield_cUSDC.address);
  console.log('seniorBond_cUSDC:', seniorBond_cUSDC.address);
  console.log('juniorBond_cUSDC:', juniorBond_cUSDC.address);
  console.log('controller_cUSDC:', controller_cUSDC.address);
  console.log('oracle_cUSDC:', oracle.address);

  // Compound DAI
  const pool_cDAI = await deployCompoundProvider(deployerSign, cDAI);
  const smartYield_cDAI = await deploySmartYield(deployerSign, juniorTokenCONF_cDAI.name, juniorTokenCONF_cDAI.symbol, BN.from(decimals_dai));
  const seniorBond_cDAI = await deploySeniorBond(deployerSign, smartYield_cDAI.address, seniorBondCONF_cDAI.name, seniorBondCONF_cDAI.symbol);
  const juniorBond_cDAI = await deployJuniorBond(deployerSign, smartYield_cDAI.address, juniorBondCONF_cDAI.name, juniorBondCONF_cDAI.symbol);
  const controller_cDAI = await deployCompoundController(deployerSign, pool_cDAI.address, smartYield_cDAI.address, bondModel.address, uniswapPath_cDAI);
  const oracle_cDAI = await deployYieldOracle(deployerSign, controller_cDAI.address, oracleCONF.windowSize, oracleCONF.granularity);
  await controller_cDAI.setOracle(oracle.address);
  await controller_cDAI.setFeesOwner(feesOwner);
  await smartYield_cDAI.setup(controller_cDAI.address, pool_cDAI.address, seniorBond_cDAI.address, juniorBond_cDAI.address);
  await pool_cDAI.setup(smartYield_cDAI.address, controller_cDAI.address);
  await controller_cDAI.setGuardian(dao);
  await controller_cDAI.setDao(dao);
  console.log('----- Compound DAI SmartYield DEPLOYED ----');
  console.log('bondModel:', bondModel.address);
  console.log('compoundProvider_cDAI:', pool_cDAI.address);
  console.log('smartYield_cDAI:', smartYield_cDAI.address);
  console.log('seniorBond_cDAI:', seniorBond_cDAI.address);
  console.log('juniorBond_cDAI:', juniorBond_cDAI.address);
  console.log('controller_cDAI:', controller_cDAI.address);
  console.log('oracle_cDAI:', oracle_cDAI.address);
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
