import 'tsconfig-paths/register';

import { deployBondModel, deployCompoundController, deployCompoundProvider, deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle } from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';
import {BondModelV1Factory} from '@typechain/BondModelV1Factory';
import { CompoundProviderFactory } from '@typechain/CompoundProviderFactory';
import { SmartYieldFactory } from '@typechain/SmartYieldFactory';
import { SeniorBondFactory } from '@typechain/SeniorBondFactory';
import { JuniorBondFactory } from '@typechain/JuniorBondFactory';
import { CompoundControllerFactory } from '@typechain/CompoundControllerFactory';

const A_HOUR = 60 * 60;
const A_DAY = A_HOUR * 24;

const seniorBondCONF = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
const juniorBondCONF = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
const juniorTokenCONF = { name: 'BarnBridge junior cDAI', symbol: 'bb_cDAI' };

const oracleCONF = { windowSize: 3 * A_DAY, granularity: 4 };

// barnbridge
const decimals = 18; // same as DAI
const feesOwner = '0x4cAE362D7F227e3d306f70ce4878E245563F3069';

// externals ---

// compound
const cDAI = '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643';
const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';

const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapPath = [COMP, WETH, DAI];

async function main() {

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  const bondModel = await deployBondModel(deployerSign);
  const pool = await deployCompoundProvider(deployerSign, cDAI);

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
  await controller.setGuardian('0x54e6a2f9991b6b6d57d152d21427e8cb80b25e91');

  console.log('CONF --------');
  console.log('cDAI:', cDAI);
  console.log('COMP:', COMP);
  console.log('DAI :', DAI);
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
