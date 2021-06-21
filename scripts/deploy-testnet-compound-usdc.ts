import 'tsconfig-paths/register';

import { deployBondModel, deployCompoundController, deployCompoundProvider, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';

const A_HOUR = 60 * 60;

const seniorBondCONF = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
const juniorBondCONF = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
const juniorTokenCONF = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

// barnbridge
const decimals = 6; // same as USDC
const dao = '0x88C072c6B78a05D8Bbd8629fE7CA88287e12B211';
const feesOwner = dao;

// externals ---

// compound
const cUSDC = '0x4a92e71227d294f041bd82dd8f78591b75140d63';
const COMP = '0x61460874a7196d6a22d1ee4922473664b3e95270';

const USDC = '0xb7a4f3e9097c08da09517b5ab877f7a917224ede';
const WETH = '0xd0A1E359811322d97991E03f863a0C30C2cF029C';
const uniswapPath = [COMP, WETH, USDC];

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModel(deployerSign);
  const pool = await deployCompoundProvider(deployerSign, cUSDC);

  const smartYield = await deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals));
  const seniorBond = await deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
  const juniorBond = await deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);

  const controller = await deployCompoundController(deployerSign, pool.address, smartYield.address, bondModel.address, uniswapPath);
  const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

  await controller.setOracle(oracle.address);
  await controller.setFeesOwner(feesOwner);
  await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
  await pool.setup(smartYield.address, controller.address);

  await controller.setGuardian(dao);
  await controller.setDao(dao);

  console.log('CONF --------');
  console.log('DAO:', dao);
  console.log('cUSDC:', cUSDC);
  console.log('COMP:', COMP);
  console.log('USDC:', USDC);
  console.log('WETH:', WETH);
  console.log('uniswapPath:', uniswapPath);
  console.log('');
  console.log('DEPLOYED ----');
  console.log('bondModel:', bondModel.address);
  console.log('compoundProvider:', pool.address);
  console.log('smartYield:', smartYield.address);
  console.log('seniorBond:', seniorBond.address);
  console.log('juniorBond:', juniorBond.address);
  console.log('controller:', controller.address);
  console.log('oracle:', oracle.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
