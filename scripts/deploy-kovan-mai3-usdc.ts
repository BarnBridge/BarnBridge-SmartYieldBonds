import 'tsconfig-paths/register';

import {
  deployBondModel,
  deployMai3Controller,
  deployMai3Provider,
  deployJuniorBond,
  deploySeniorBond,
  deploySmartYield,
  deploySignedYieldOracle
} from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';

const A_HOUR = 60 * 60;
const A_DAY = A_HOUR * 24;

const seniorBondCONF = { name: 'BarnBridge MAI3 USDC sBOND', symbol: 'bbscMai3USDC' };
const juniorBondCONF = { name: 'BarnBridge MAI3 USDC jBOND', symbol: 'bbjcMai3USDC' };
const juniorTokenCONF = { name: 'BarnBridge MAI3 USDC', symbol: 'bbcMai3USDC' };

const oracleCONF = { windowSize: 10 * A_DAY, granularity: 20 };

// barnbridge
const decimals = 18;
const dao = '0xa2aAD83466241232290bEbcd43dcbFf6A7f8d23a';
const feesOwner = dao;

// externals ---
const MCB_SPOT_ORACLE = '';

// compound
const USDC_POOL = '0xFE62314f9FB010BEBF52808cD5A4c571a47c4c46';
const MCB = '0xA0A45F2B616a740C3C7a7fF69Be893f61E6455E3';
const USDC = '0xd4AC81D9FD2b28363eBD1D88a8364Ff3b3577e84';

const uniswapPath = [MCB, USDC];

async function main() {
  const [deployerSign, ...signers] = ((await ethers.getSigners()) as unknown[]) as Wallet[];

  console.log('Deployer:', deployerSign.address);
  console.log(
    'Others:',
    signers.map(a => a.address)
  );

  const bondModel = await deployBondModel(deployerSign);
  const pool = await deployMai3Provider(deployerSign, USDC_POOL);

  const smartYield = await deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals));
  const seniorBond = await deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol);
  const juniorBond = await deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol);

  const controller = await deployMai3Controller(
    deployerSign,
    pool.address,
    smartYield.address,
    bondModel.address,
    uniswapPath,
    MCB_SPOT_ORACLE,
    0
  );
  const oracle = await deploySignedYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

  await controller.setOracle(oracle.address);
  await controller.setFeesOwner(feesOwner);
  await smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address);
  await pool.setup(smartYield.address, controller.address);

  await controller.setGuardian(dao);
  await controller.setDao(dao);

  console.log('CONF --------');
  console.log('DAO:', dao);
  console.log('MAI3_POOL:', USDC_POOL);
  console.log('MCB:', MCB);
  console.log('USDC:', USDC);
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
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
