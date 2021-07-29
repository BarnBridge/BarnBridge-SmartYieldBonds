import 'tsconfig-paths/register';
import {
  deployBondModel, deployBondModelV2Linear,
  deployCompoundController, deployCompoundProvider,
  deployAaveController, deployAaveProvider,
  deployCreamController, deployCreamProvider,
  deployJuniorBond, deploySeniorBond, deploySmartYield, deployYieldOracle
} from '@testhelp/index';
import { Wallet, BigNumber as BN } from 'ethers';
import { run, ethers } from 'hardhat';
import { ERC20Factory } from '@typechain/ERC20Factory';
import { IATokenFactory } from '@typechain/IATokenFactory';


require('dotenv').config();

const A_HOUR = 60 * 60;
const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

// BarnBridge Governance Contract
const dao = process.env.DAO;
const feesOwner = dao;

// Decimal Places
const decimals_usdc = 6; // same as USDC
const decimals_usdt = 6; // same as USDT
const decimals_dai = 18; // same as DAI

// External Token Addresses
const USDC = process.env.USDC;
const USDT = process.env.USDC;
const WETH = process.env.WETH;
const DAI = process.env.DAI;

// Provider Tokens Addresses
const cUSDC = process.env.CUSDC;
const cUSDT = process.env.CUSDT;
const cDAI = process.env.CDAI;
const COMP = process.env.COMP;
const aUSDC = process.env.AUSDC;
const aUSDT = process.env.AUSDT;
const aGUSD = process.env.AGUSD;
const aSUSD = process.env.ASUSD;
const aDAI = process.env.ADAI;
const crUSDC = process.env.CRUSDC;
const crDAI = process.env.CRDAI;
const crUSDT = process.env.CRUSDT;

// UniSwap Mappings
const uniswapPath_cUSDC = [COMP, WETH, USDC];
const uniswapPath_cUSDT = [COMP, WETH, USDT];
const uniswapPath_cDAI = [COMP, WETH, DAI];

// Compound USDC Symbol Mappings
const seniorBondCONF_cUSDC = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
const juniorBondCONF_cUSDC = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
const juniorTokenCONF_cUSDC = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };

// Compound USDT Symbol Mappings
const seniorBondCONF_cUSDT = { name: 'BarnBridge cUSDT sBOND', symbol: 'bbscUSDT' };
const juniorBondCONF_cUSDT = { name: 'BarnBridge cUSDT jBOND', symbol: 'bbjcUSDT' };
const juniorTokenCONF_cUSDT = { name: 'BarnBridge cUSDT', symbol: 'bbcUSDT' };

// Compound DAI Symbol Mappings
const seniorBondCONF_cDAI = { name: 'BarnBridge cDAI sBOND', symbol: 'bb_sBOND_cDAI' };
const juniorBondCONF_cDAI = { name: 'BarnBridge cDAI jBOND', symbol: 'bb_jBOND_cDAI' };
const juniorTokenCONF_cDAI = { name: 'BarnBridge cDAI', symbol: 'bb_cDAI' };

// Aave USDC Symbol Mappings
const seniorBondCONF_aUSDC = { name: 'BarnBridge aUSDC sBOND', symbol: 'bb_sBOND_aUSDC' };
const juniorBondCONF_aUSDC = { name: 'BarnBridge aUSDC jBOND', symbol: 'bb_jBOND_aUSDC' };
const juniorTokenCONF_aUSDC = { name: 'BarnBridge aUSDC', symbol: 'bb_aUSDC' };

// Aave USDT Symbol Mappings
const seniorBondCONF_aUSDT = { name: 'BarnBridge aUSDT sBOND', symbol: 'bb_sBOND_aUSDT' };
const juniorBondCONF_aUSDT = { name: 'BarnBridge aUSDT jBOND', symbol: 'bb_jBOND_aUSDT' };
const juniorTokenCONF_aUSDT = { name: 'BarnBridge aUSDT', symbol: 'bb_aUSDT' };

// Aave SUSD Symbol Mappings
const seniorBondCONF_aSUSD = { name: 'BarnBridge aSUSD sBOND', symbol: 'bb_sBOND_aSUSD' };
const juniorBondCONF_aSUSD= { name: 'BarnBridge aSUSD jBOND', symbol: 'bb_jBOND_aSUSD' };
const juniorTokenCONF_aSUSD = { name: 'BarnBridge aSUSD', symbol: 'bb_aSUSD' };

// Cream USDC Symbol Mappings
const seniorBondCONF_crUSDC = { name: 'BarnBridge crUSDC sBOND', symbol: 'bb_sBOND_crUSDC' };
const juniorBondCONF_crUSDC = { name: 'BarnBridge crUSDC jBOND', symbol: 'bb_jBOND_crUSDC' };
const juniorTokenCONF_crUSDC = { name: 'BarnBridge crUSDC', symbol: 'bb_crUSDC' };

async function main() {
  if (process.env.PRINTENV === 'true') { console.log(JSON.stringify(process.env, null, 4)) };
  console.log('BarnBridge DAO:', dao);
  console.log('BarnBridge Fees Owner:', feesOwner);
  console.log('External Contract Configuration:');
  console.log('COMP:', COMP);
  console.log('USDC:', USDC);
  console.log('WETH:', WETH);
  console.log('DAI:', DAI);
  console.log('cUSDC:', cUSDC);
  console.log('cDAI:', cDAI);
  console.log('aUSDC:', aUSDC);
  console.log('aUSDT:', aUSDT);
  console.log('aGUSD:', aGUSD);
  console.log('aDAI:', aDAI);
  console.log('crUSDC:', crUSDC);
  console.log('crUSDC:', crDAI);
  console.log('crUSDT:', crUSDT);


  console.log('UniSwap Path Mappings');
  console.log('uniswapPath_cUSDC:', uniswapPath_cUSDC);
  console.log('uniswapPath_cDAI:', uniswapPath_cDAI);

  const [deployerSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];
  console.log('Deployers:', deployerSign.address);
  console.log('Others:', signers.map(a => a.address));

  // TODO: check deployerSign.address for exisging bondModel or bondModelV2 to skip re-deploying
  const bondModel = await deployBondModel(deployerSign);
  console.log('bondModel:', bondModel.address);
  const bondModelV2 = await deployBondModelV2Linear(deployerSign);
  console.log('bondModelV2:', bondModelV2.address);

  // Compound USDC
  if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_CUSDC === 'true')) {
    console.log('##### Deploying Compound USDC SmartYield #####');
    const pool_cUSDC = await deployCompoundProvider(deployerSign, cUSDC);
    const smartYield_cUSDC = await deploySmartYield(deployerSign, juniorTokenCONF_cUSDC.name, juniorTokenCONF_cUSDC.symbol, BN.from(decimals_usdc));
    const seniorBond_cUSDC = await deploySeniorBond(deployerSign, smartYield_cUSDC.address, seniorBondCONF_cUSDC.name, seniorBondCONF_cUSDC.symbol);
    const juniorBond_cUSDC = await deployJuniorBond(deployerSign, smartYield_cUSDC.address, juniorBondCONF_cUSDC.name, juniorBondCONF_cUSDC.symbol);
    const controller_cUSDC = await deployCompoundController(deployerSign, pool_cUSDC.address, smartYield_cUSDC.address, bondModel.address, uniswapPath_cUSDC);
    const oracle_cUSDC = await deployYieldOracle(deployerSign, controller_cUSDC.address, oracleCONF.windowSize, oracleCONF.granularity);
    await controller_cUSDC.setOracle(oracle_cUSDC.address);
    await controller_cUSDC.setFeesOwner(feesOwner);
    await smartYield_cUSDC.setup(controller_cUSDC.address, pool_cUSDC.address, seniorBond_cUSDC.address, juniorBond_cUSDC.address);
    await pool_cUSDC.setup(smartYield_cUSDC.address, controller_cUSDC.address);
    await controller_cUSDC.setGuardian(dao);
    await controller_cUSDC.setDao(dao);
    console.log('----- Compound USDC SmartYield DEPLOYED ----');
    console.log('compoundProvider_cUSDC:', pool_cUSDC.address);
    console.log('smartYield_cUSDC:', smartYield_cUSDC.address);
    console.log('seniorBond_cUSDC:', seniorBond_cUSDC.address);
    console.log('juniorBond_cUSDC:', juniorBond_cUSDC.address);
    console.log('controller_cUSDC:', controller_cUSDC.address);
    console.log('oracle_cUSDC:', oracle_cUSDC.address);
  }
  // Compound DAI
  if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_CDAI === 'true')) {
    console.log('##### Deploying Compound DAI SmartYield #####');
    const pool_cDAI = await deployCompoundProvider(deployerSign, cDAI);
    const smartYield_cDAI = await deploySmartYield(deployerSign, juniorTokenCONF_cDAI.name, juniorTokenCONF_cDAI.symbol, BN.from(decimals_dai));
    const seniorBond_cDAI = await deploySeniorBond(deployerSign, smartYield_cDAI.address, seniorBondCONF_cDAI.name, seniorBondCONF_cDAI.symbol);
    const juniorBond_cDAI = await deployJuniorBond(deployerSign, smartYield_cDAI.address, juniorBondCONF_cDAI.name, juniorBondCONF_cDAI.symbol);
    const controller_cDAI = await deployCompoundController(deployerSign, pool_cDAI.address, smartYield_cDAI.address, bondModel.address, uniswapPath_cDAI);
    const oracle_cDAI = await deployYieldOracle(deployerSign, controller_cDAI.address, oracleCONF.windowSize, oracleCONF.granularity);
    await controller_cDAI.setOracle(oracle_cDAI.address);
    await controller_cDAI.setFeesOwner(feesOwner);
    await smartYield_cDAI.setup(controller_cDAI.address, pool_cDAI.address, seniorBond_cDAI.address, juniorBond_cDAI.address);
    await pool_cDAI.setup(smartYield_cDAI.address, controller_cDAI.address);
    await controller_cDAI.setGuardian(dao);
    await controller_cDAI.setDao(dao);
    console.log('----- Compound DAI SmartYield DEPLOYED ----');
    console.log('compoundProvider_cDAI:', pool_cDAI.address);
    console.log('smartYield_cDAI:', smartYield_cDAI.address);
    console.log('seniorBond_cDAI:', seniorBond_cDAI.address);
    console.log('juniorBond_cDAI:', juniorBond_cDAI.address);
    console.log('controller_cDAI:', controller_cDAI.address);
    console.log('oracle_cDAI:', oracle_cDAI.address);
  }

  // Compound USDT
  if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_CUSDT === 'true')) {
    console.log('##### Deploying Compound USDT SmartYield #####');
    const pool_cUSDT = await deployCompoundProvider(deployerSign, cUSDT);
    const smartYield_cUSDT = await deploySmartYield(deployerSign, juniorTokenCONF_cUSDT.name, juniorTokenCONF_cUSDT.symbol, BN.from(decimals_dai));
    const seniorBond_cUSDT = await deploySeniorBond(deployerSign, smartYield_cUSDT.address, seniorBondCONF_cUSDT.name, seniorBondCONF_cUSDT.symbol);
    const juniorBond_cUSDT = await deployJuniorBond(deployerSign, smartYield_cUSDT.address, juniorBondCONF_cUSDT.name, juniorBondCONF_cUSDT.symbol);
    const controller_cUSDT = await deployCompoundController(deployerSign, pool_cUSDT.address, smartYield_cUSDT.address, bondModel.address, uniswapPath_cUSDT);
    const oracle_cUSDT = await deployYieldOracle(deployerSign, controller_cUSDT.address, oracleCONF.windowSize, oracleCONF.granularity);
    await controller_cUSDT.setOracle(oracle_cUSDT.address);
    await controller_cUSDT.setFeesOwner(feesOwner);
    await smartYield_cUSDT.setup(controller_cUSDT.address, pool_cUSDT.address, seniorBond_cUSDT.address, juniorBond_cUSDT.address);
    await pool_cUSDT.setup(smartYield_cUSDT.address, controller_cUSDT.address);
    await controller_cUSDT.setGuardian(dao);
    await controller_cUSDT.setDao(dao);
    console.log('----- Compound USDT SmartYield DEPLOYED ----');
    console.log('compoundProvider_cUSDT:', pool_cUSDT.address);
    console.log('smartYield_cUSDT:', smartYield_cUSDT.address);
    console.log('seniorBond_cUSDT:', seniorBond_cUSDT.address);
    console.log('juniorBond_cUSDT:', juniorBond_cUSDT.address);
    console.log('controller_cUSDT:', controller_cUSDT.address);
    console.log('oracle_cUSDT:', oracle_cUSDT.address);
  }

  // Aave USDC
  if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_AUSDC === 'true')) {
    console.log('##### Deploying Aave USDC SmartYield #####');
    const aToken_aUSDC = IATokenFactory.connect(aUSDC, deployerSign);
    const underlyingTOKEN = await aToken_aUSDC.callStatic.UNDERLYING_ASSET_ADDRESS();
    const pool_aUSDC = await deployAaveProvider(deployerSign, aUSDC);
    const smartYield_aUSDC = await deploySmartYield(deployerSign, juniorTokenCONF_aUSDC.name, juniorTokenCONF_aUSDC.symbol, BN.from(decimals_usdc));
    const seniorBond_aUSDC = await deploySeniorBond(deployerSign, smartYield_aUSDC.address, seniorBondCONF_aUSDC.name, seniorBondCONF_aUSDC.symbol);
    const juniorBond_aUSDC = await deployJuniorBond(deployerSign, smartYield_aUSDC.address, juniorBondCONF_aUSDC.name, juniorBondCONF_aUSDC.symbol);
    const controller_aUSDC = await deployAaveController(deployerSign, pool_aUSDC.address, smartYield_aUSDC.address, bondModelV2.address, deployerSign.address);
    const oracle_aUSDC = await deployYieldOracle(deployerSign, controller_aUSDC.address, oracleCONF.windowSize, oracleCONF.granularity);
    await (await controller_aUSDC.setOracle(oracle_aUSDC.address)).wait(2);
    await (await controller_aUSDC.setFeesOwner(feesOwner)).wait(2);
    await (await smartYield_aUSDC.setup(controller_aUSDC.address, pool_aUSDC.address, seniorBond_aUSDC.address, juniorBond_aUSDC.address)).wait(2);
    await (await pool_aUSDC.setup(smartYield_aUSDC.address, controller_aUSDC.address)).wait(2);
    await (await controller_aUSDC.setGuardian(dao)).wait(2);
    await (await controller_aUSDC.setDao(dao)).wait(2);
    console.log('----- Aave USDC SmartYield DEPLOYED ----');
    console.log('AaveProvider_aUSDC:', pool_aUSDC.address, '[', aUSDC, ']');
    console.log('smartYield_aUSDC:', smartYield_aUSDC, '[', juniorTokenCONF_aUSDC.name, juniorTokenCONF_aUSDC.symbol, decimals_usdc, ']');
    console.log('seniorBond_aUSDC:', seniorBond_aUSDC.address, '[', smartYield_aUSDC.address, seniorBondCONF_aUSDC.name, seniorBondCONF_aUSDC.symbol, ']');
    console.log('juniorBond_aUSDC:', juniorBond_aUSDC.address, '[', smartYield_aUSDC.address, juniorBondCONF_aUSDC.name, juniorBondCONF_aUSDC.symbol, ']');
    console.log('controller_aUSDC:', controller_aUSDC.address, '[', pool_aUSDC.address, smartYield_aUSDC.address, bondModelV2.address, deployerSign.address, ']');
    console.log('oracle_aUSDC:', oracle_aUSDC.address, '[', controller_aUSDC.address, oracleCONF.windowSize, oracleCONF.granularity, ']');
  }

    // Aave USDT
    if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_AUSDT === 'true')) {
      console.log('##### Deploying Aave USDT SmartYield #####');
      const aToken_aUSDT = IATokenFactory.connect(aUSDT, deployerSign);
      const underlyingTOKEN = await aToken_aUSDT.callStatic.UNDERLYING_ASSET_ADDRESS();
      const pool_aUSDT = await deployAaveProvider(deployerSign, aUSDT);
      const smartYield_aUSDT = await deploySmartYield(deployerSign, juniorTokenCONF_aUSDT.name, juniorTokenCONF_aUSDT.symbol, BN.from(decimals_usdt));
      const seniorBond_aUSDT = await deploySeniorBond(deployerSign, smartYield_aUSDT.address, seniorBondCONF_aUSDT.name, seniorBondCONF_aUSDT.symbol);
      const juniorBond_aUSDT = await deployJuniorBond(deployerSign, smartYield_aUSDT.address, juniorBondCONF_aUSDT.name, juniorBondCONF_aUSDT.symbol);
      const controller_aUSDT = await deployAaveController(deployerSign, pool_aUSDT.address, smartYield_aUSDT.address, bondModelV2.address, deployerSign.address);
      const oracle_aUSDT = await deployYieldOracle(deployerSign, controller_aUSDT.address, oracleCONF.windowSize, oracleCONF.granularity);
      await (await controller_aUSDT.setOracle(oracle_aUSDT.address)).wait(2);
      await (await controller_aUSDT.setFeesOwner(feesOwner)).wait(2);
      await (await smartYield_aUSDT.setup(controller_aUSDT.address, pool_aUSDT.address, seniorBond_aUSDT.address, juniorBond_aUSDT.address)).wait(2);
      await (await pool_aUSDT.setup(smartYield_aUSDT.address, controller_aUSDT.address)).wait(2);
      await (await controller_aUSDT.setGuardian(dao)).wait(2);
      await (await controller_aUSDT.setDao(dao)).wait(2);
      console.log('----- Aave USDT SmartYield DEPLOYED ----');
      console.log('AaveProvider_aUSDT:', pool_aUSDT.address, '[', aUSDT, ']');
      console.log('smartYield_aUSDT:', smartYield_aUSDT, '[', juniorTokenCONF_aUSDT.name, juniorTokenCONF_aUSDT.symbol, decimals_usdt, ']');
      console.log('seniorBond_aUSDT:', seniorBond_aUSDT.address, '[', smartYield_aUSDT.address, seniorBondCONF_aUSDT.name, seniorBondCONF_aUSDT.symbol, ']');
      console.log('juniorBond_aUSDT:', juniorBond_aUSDT.address, '[', smartYield_aUSDT.address, juniorBondCONF_aUSDT.name, juniorBondCONF_aUSDT.symbol, ']');
      console.log('controller_aUSDT:', controller_aUSDT.address, '[', pool_aUSDT.address, smartYield_aUSDT.address, bondModelV2.address, deployerSign.address, ']');
      console.log('oracle_aUSDT:', oracle_aUSDT.address, '[', controller_aUSDT.address, oracleCONF.windowSize, oracleCONF.granularity, ']');
    }

    // Aave sUSD
    if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_ASUSD === 'true')) {
      console.log('##### Deploying Aave SUSD SmartYield #####');
      const aToken_aSUSD = IATokenFactory.connect(aSUSD, deployerSign);
      const underlyingTOKEN = await aToken_aSUSD.callStatic.UNDERLYING_ASSET_ADDRESS();
      const pool_aSUSD = await deployAaveProvider(deployerSign, aSUSD);
      const smartYield_aSUSD = await deploySmartYield(deployerSign, juniorTokenCONF_aSUSD.name, juniorTokenCONF_aSUSD.symbol, BN.from(decimals_usdt));
      const seniorBond_aSUSD = await deploySeniorBond(deployerSign, smartYield_aSUSD.address, seniorBondCONF_aSUSD.name, seniorBondCONF_aSUSD.symbol);
      const juniorBond_aSUSD = await deployJuniorBond(deployerSign, smartYield_aSUSD.address, juniorBondCONF_aSUSD.name, juniorBondCONF_aSUSD.symbol);
      const controller_aSUSD = await deployAaveController(deployerSign, pool_aSUSD.address, smartYield_aSUSD.address, bondModelV2.address, deployerSign.address);
      const oracle_aSUSD = await deployYieldOracle(deployerSign, controller_aSUSD.address, oracleCONF.windowSize, oracleCONF.granularity);
      await (await controller_aSUSD.setOracle(oracle_aSUSD.address)).wait(2);
      await (await controller_aSUSD.setFeesOwner(feesOwner)).wait(2);
      await (await smartYield_aSUSD.setup(controller_aSUSD.address, pool_aSUSD.address, seniorBond_aSUSD.address, juniorBond_aSUSD.address)).wait(2);
      await (await pool_aSUSD.setup(smartYield_aSUSD.address, controller_aSUSD.address)).wait(2);
      await (await controller_aSUSD.setGuardian(dao)).wait(2);
      await (await controller_aSUSD.setDao(dao)).wait(2);
      console.log('----- Aave SUSD SmartYield DEPLOYED ----');
      console.log('AaveProvider_aSUSD:', pool_aSUSD.address, '[', aSUSD, ']');
      console.log('smartYield_aSUSD:', smartYield_aSUSD, '[', juniorTokenCONF_aSUSD.name, juniorTokenCONF_aSUSD.symbol, decimals_usdt, ']');
      console.log('seniorBond_aSUSD:', seniorBond_aSUSD.address, '[', smartYield_aSUSD.address, seniorBondCONF_aSUSD.name, seniorBondCONF_aSUSD.symbol, ']');
      console.log('juniorBond_aSUSD:', juniorBond_aSUSD.address, '[', smartYield_aSUSD.address, juniorBondCONF_aSUSD.name, juniorBondCONF_aSUSD.symbol, ']');
      console.log('controller_aSUSD:', controller_aSUSD.address, '[', pool_aSUSD.address, smartYield_aSUSD.address, bondModelV2.address, deployerSign.address, ']');
      console.log('oracle_aSUSD:', oracle_aSUSD.address, '[', controller_aSUSD.address, oracleCONF.windowSize, oracleCONF.granularity, ']');
    }


    // TODO: Kovan Aave GUSD once deployed
    // TODO: Kovan Aave DAI once deployed
    // TODO: Kovan Aave RAI once deployed

    // Cream USDC
    if ((process.env.DEPLOY_ALL === 'true') || (process.env.DEPLOY_CRUSDC === 'true')) {
      console.log('##### Deploying Cream USDC SmartYield #####');
      const pool_crUSDC = await deployCreamProvider(deployerSign, crUSDC);
      const smartYield_crUSDC = await deploySmartYield(deployerSign, juniorTokenCONF_crUSDC.name, juniorTokenCONF_crUSDC.symbol, BN.from(decimals_usdc));
      const seniorBond_crUSDC = await deploySeniorBond(deployerSign, smartYield_crUSDC.address, seniorBondCONF_crUSDC.name, seniorBondCONF_crUSDC.symbol);
      const juniorBond_crUSDC = await deployJuniorBond(deployerSign, smartYield_crUSDC.address, juniorBondCONF_crUSDC.name, juniorBondCONF_crUSDC.symbol);   
      const controller_crUSDC = await deployCreamController(deployerSign, pool_crUSDC.address, smartYield_crUSDC.address, bondModelV2.address, deployerSign.address);
      const oracle_crUSDC = await deployYieldOracle(deployerSign, controller_crUSDC.address, oracleCONF.windowSize, oracleCONF.granularity);
      await controller_crUSDC.setOracle(oracle_crUSDC.address);
      await controller_crUSDC.setFeesOwner(feesOwner);
      await smartYield_crUSDC.setup(controller_crUSDC.address, pool_crUSDC.address, seniorBond_crUSDC.address, juniorBond_crUSDC.address);
      await pool_crUSDC.setup(smartYield_crUSDC.address, controller_crUSDC.address);
      await controller_crUSDC.setGuardian(dao);
      await controller_crUSDC.setDao(dao);
      console.log('----- Cream USDC SmartYield DEPLOYED ----');
      console.log('CreamProvider_crUSDC:', pool_crUSDC.address, '[', crUSDC, ']');
      console.log('smartYield_crUSDC:', smartYield_crUSDC.address, '[', juniorTokenCONF_crUSDC.name, juniorTokenCONF_crUSDC.symbol, decimals_usdc, ']');
      console.log('seniorBond_crUSDC:', seniorBond_crUSDC.address, '[', smartYield_crUSDC.address, seniorBondCONF_crUSDC.name, seniorBondCONF_crUSDC.symbol, ']');
      console.log('juniorBond_crUSDC:', juniorBond_crUSDC.address, '[', smartYield_crUSDC.address, juniorBondCONF_crUSDC.name, juniorBondCONF_crUSDC.symbol, ']');
      console.log('controller_crUSDC:', controller_crUSDC.address, '[', pool_crUSDC.address, smartYield_crUSDC.address, bondModelV2.address, deployerSign.address, ']');
      console.log('oracle_crUSDC:', oracle_crUSDC.address, '[', controller_crUSDC.address, oracleCONF.windowSize, oracleCONF.granularity, ']');
    }
    // TODO: Kovan Cream USDT once deployed
    // TODO: Kovan Cream DAI once deployed

}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
