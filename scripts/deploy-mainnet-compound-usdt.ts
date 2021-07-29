import 'tsconfig-paths/register';

import { deployBondModel, deployBondModelV2Compounded, deployCompoundController, deployCompoundProvider, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';

const A_HOUR = 60 * 60;
const A_DAY = A_HOUR * 24;

const seniorBondCONF = { name: 'BarnBridge cUSDT sBOND', symbol: 'bb_sBOND_cUSDT' };
const juniorBondCONF = { name: 'BarnBridge cUSDT jBOND', symbol: 'bb_jBOND_cUSDT' };
const juniorTokenCONF = { name: 'BarnBridge junior cUSDT', symbol: 'bb_cUSDT' };

const oracleCONF = { windowSize: 3 * A_DAY, granularity: 4 };

// barnbridge
const decimals = 6; // same as USDT
const feesOwner = '0x4cAE362D7F227e3d306f70ce4878E245563F3069';

// externals ---

// compound
const cUSDT = '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9';
const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const uniswapPath = [COMP, WETH, USDT];

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModelV2Compounded(deployerSign);
  const pool = await deployCompoundProvider(deployerSign, cUSDT);

  const smartYield = await deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals));
  const seniorBond = await deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
  const juniorBond = await deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);

  const controller = await deployCompoundController(deployerSign, pool.address, smartYield.address, bondModel.address, uniswapPath);
  const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

  await controller.setOracle(oracle.address);
  await controller.setFeesOwner(feesOwner);
  await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
  await pool.setup(smartYield.address, controller.address);

  await controller.setBondLifeMax(365);
  await controller.setFeeBuyJuniorToken(BN.from('5000000000000000'));
  await controller.setFeeRedeemSeniorBond(BN.from('50000000000000000'));
  await bondModel.setMaxPoolRatio(BN.from('650000000000000000'));
  await controller.setGuardian('0x54e6a2f9991b6b6d57d152d21427e8cb80b25e91');
  await bondModel.setGuardian('0x54e6a2f9991b6b6d57d152d21427e8cb80b25e91');

  console.log('CONF --------');
  console.log('cUSDT:', cUSDT);
  console.log('COMP:', COMP);
  console.log('USDT:', USDT);
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
