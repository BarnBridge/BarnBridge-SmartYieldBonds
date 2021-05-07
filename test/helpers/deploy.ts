import { deployContract } from 'ethereum-waffle';
import { Signer, Wallet, BigNumber as BN, BigNumberish } from 'ethers';
import { toBN } from './misc';

import SmartYieldArtifact from '../../artifacts/contracts/SmartYield.sol/SmartYield.json';
import { SmartYield } from '@typechain/SmartYield';

import Erc20MockArtifact from '../../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { Erc20Mock } from '@typechain/Erc20Mock';

import YieldOracleArtifact from './../../artifacts/contracts/oracle/YieldOracle.sol/YieldOracle.json';
import { YieldOracle } from '@typechain/YieldOracle';
import { IBondModel } from '@typechain/IBondModel';

import YieldOracleMockArtifact from './../../artifacts/contracts/mocks/barnbridge/YieldOracleMock.sol/YieldOracleMock.json';
import { YieldOracleMock } from '@typechain/YieldOracleMock';

import CompoundControllerArtifact from './../../artifacts/contracts/providers/CompoundController.sol/CompoundController.json';
import { CompoundController } from '@typechain/CompoundController';

import CreamControllerArtifact from './../../artifacts/contracts/providers/CreamController.sol/CreamController.json';
import { CreamController } from '@typechain/CreamController';

import AaveControllerArtifact from './../../artifacts/contracts/providers/AaveController.sol/AaveController.json';
import { AaveController } from '@typechain/AaveController';

import JuniorBondArtifact from './../../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
import { JuniorBond } from '@typechain/JuniorBond';

import SeniorBondArtifact from './../../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
import { SeniorBond } from '@typechain/SeniorBond';

import SmartYieldMockArtifact from './../../artifacts/contracts/mocks/barnbridge/SmartYieldMock.sol/SmartYieldMock.json';
import { SmartYieldMock } from '@typechain/SmartYieldMock';

import BondModelV1Artifact from './../../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import { BondModelV1 } from '@typechain/BondModelV1';

import BondModelV2LinearArtifact from './../../artifacts/contracts/model/BondModelV2Linear.sol/BondModelV2Linear.json';
import { BondModelV2Linear } from '@typechain/BondModelV2Linear';

import BondModelV2CompoundedArtifact from './../../artifacts/contracts/model/BondModelV2Compounded.sol/BondModelV2Compounded.json';
import { BondModelV2Compounded } from '@typechain/BondModelV2Compounded';

import UniswapMockArtifact from './../../artifacts/contracts/mocks/uniswap/UniswapMock.sol/UniswapMock.json';
import { UniswapMock } from '@typechain/UniswapMock';

import CompoundProviderArtifact from './../../artifacts/contracts/providers/CompoundProvider.sol/CompoundProvider.json';
import { CompoundProvider } from '@typechain/CompoundProvider';

import CreamProviderArtifact from './../../artifacts/contracts/providers/CreamProvider.sol/CreamProvider.json';
import { CreamProvider } from '@typechain/CreamProvider';

import AaveProviderArtifact from './../../artifacts/contracts/providers/AaveProvider.sol/AaveProvider.json';
import { AaveProvider } from '@typechain/AaveProvider';

// ---- mocks

import HarvestWorldMockArtifact from './../../artifacts/contracts/mocks/barnbridge/harvest/HarvestWorldMock.sol/HarvestWorldMock.json';
import { HarvestWorldMock } from '@typechain/HarvestWorldMock';

import CompoundControllerHarvestMockArtifact from './../../artifacts/contracts/mocks/barnbridge/harvest/CompoundControllerHarvestMock.sol/CompoundControllerHarvestMock.json';
import { CompoundControllerHarvestMock } from '@typechain/CompoundControllerHarvestMock';

import CompoundControllerMockArtifact from './../../artifacts/contracts/mocks/barnbridge/CompoundControllerMock.sol/CompoundControllerMock.json';
import { CompoundControllerMock } from '@typechain/CompoundControllerMock';

import CTokenWorldMockArtifact from './../../artifacts/contracts/mocks/compound-finance/CTokenWorldMock.sol/CTokenWorldMock.json';
import { CTokenWorldMock } from '@typechain/CTokenWorldMock';

import ATokenWorldMockArtifact from './../../artifacts/contracts/mocks/aave/ATokenWorldMock.sol/ATokenWorldMock.json';
import { ATokenWorldMock } from '@typechain/ATokenWorldMock';

// / --- mocks

import MathTestsArtifact from './../../artifacts/contracts/mocks/barnbridge/MathTests.sol/MathTests.json';
import { MathTests } from '@typechain/MathTests';


export const deployUnderlying = (deployerSign: Wallet, decimals: number): Promise<Erc20Mock> => {
  return (deployContract(deployerSign, Erc20MockArtifact, ['DAI mock', 'DAI', decimals])) as Promise<Erc20Mock>;
};

export const deployCompToken = (deployerSign: Wallet): Promise<Erc20Mock> => {
  return (deployContract(deployerSign, Erc20MockArtifact, ['COMP mock', 'COMP', 18])) as Promise<Erc20Mock>;
};

export const deployYieldOracle = (deployerSign: Wallet, cumulativeAddress: string, windowSize: number, granularity: number): Promise<YieldOracle> => {
  return (deployContract(deployerSign, YieldOracleArtifact, [cumulativeAddress, windowSize, granularity])) as Promise<YieldOracle>;
};

export const deployYieldOracleMock = (deployerSign: Wallet): Promise<YieldOracleMock> => {
  return (deployContract(deployerSign, YieldOracleMockArtifact, [])) as Promise<YieldOracleMock>;
};

export const deployCompoundController = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, uniswapPath: string[] = []): Promise<CompoundController> => {
  return (deployContract(deployerSign, CompoundControllerArtifact, [poolAddress, smartYieldAddress, bondModelAddress, uniswapPath])) as Promise<CompoundController>;
};

export const deployCreamController = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string): Promise<CreamController> => {
  return (deployContract(deployerSign, CreamControllerArtifact, [poolAddress, smartYieldAddress, bondModelAddress])) as Promise<CreamController>;
};

export const deployAaveController = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, rewardsCollectorAddress: string): Promise<AaveController> => {
  return (deployContract(deployerSign, AaveControllerArtifact, [poolAddress, smartYieldAddress, bondModelAddress, rewardsCollectorAddress])) as Promise<AaveController>;
};

export const deployJuniorBondMock = (deployerSign: Wallet, smartYield: SmartYield): Promise<JuniorBond> => {
  return (deployContract(deployerSign, JuniorBondArtifact, [smartYield.address, 'jBOND mock', 'jBOND'])) as Promise<JuniorBond>;
};

export const deploySeniorBondMock = (deployerSign: Wallet, smartYield: SmartYield): Promise<SeniorBond> => {
  return (deployContract(deployerSign, SeniorBondArtifact, [smartYield.address, 'sBOND mock', 'sBOND'])) as Promise<SeniorBond>;
};

export const deploySmartYieldMock = (deployerSign: Wallet, underlyingDecimals_: BigNumberish): Promise<SmartYieldMock> => {
  return (deployContract(deployerSign, SmartYieldMockArtifact, [underlyingDecimals_])) as Promise<SmartYieldMock>;
};

export const deployBondModel = (deployerSign: Wallet): Promise<BondModelV1> => {
  return (deployContract(deployerSign, BondModelV1Artifact, [])) as Promise<BondModelV1>;
};

export const deployBondModelV2Linear = (deployerSign: Wallet): Promise<BondModelV2Linear> => {
  return (deployContract(deployerSign, BondModelV2LinearArtifact, [])) as Promise<BondModelV2Linear>;
};

export const deployBondModelV2Compounded = (deployerSign: Wallet): Promise<BondModelV2Compounded> => {
  return (deployContract(deployerSign, BondModelV2CompoundedArtifact, [])) as Promise<BondModelV2Compounded>;
};

export const deployUniswapMock = (deployerSign: Wallet): Promise<UniswapMock> => {
  return (deployContract(deployerSign, UniswapMockArtifact, [])) as Promise<UniswapMock>;
};

export const deployCompoundProvider = (deployerSign: Wallet, cTokenAddress: string): Promise<CompoundProvider> => {
  return (deployContract(deployerSign, CompoundProviderArtifact, [cTokenAddress])) as Promise<CompoundProvider>;
};

export const deployCreamProvider = (deployerSign: Wallet, crTokenAddress: string): Promise<CreamProvider> => {
  return (deployContract(deployerSign, CreamProviderArtifact, [crTokenAddress])) as Promise<CreamProvider>;
};

export const deployAaveProvider = (deployerSign: Wallet, aTokenAddress: string): Promise<AaveProvider> => {
  return (deployContract(deployerSign, AaveProviderArtifact, [aTokenAddress])) as Promise<AaveProvider>;
};

export const deploySmartYield = (deployerSign: Wallet, name: string, symbol: string, decimals: BigNumberish): Promise<SmartYield> => {
  return (deployContract(deployerSign, SmartYieldArtifact, [name, symbol, decimals])) as Promise<SmartYield>;
};

export const deploySeniorBond = (deployerSign: Wallet, smartYieldAddress: string, name: string, symbol: string): Promise<SeniorBond> => {
  return (deployContract(deployerSign, SeniorBondArtifact, [smartYieldAddress, name, symbol])) as Promise<SeniorBond>;
};

export const deployJuniorBond = (deployerSign: Wallet, smartYieldAddress: string, name: string, symbol: string): Promise<JuniorBond> => {
  return (deployContract(deployerSign, JuniorBondArtifact, [smartYieldAddress, name, symbol])) as Promise<JuniorBond>;
};

export const deployHarvestMockWorld = (deployerSign: Wallet, underlyingDecimals: number): Promise<HarvestWorldMock> => {
  return (deployContract(deployerSign, HarvestWorldMockArtifact, [underlyingDecimals])) as Promise<HarvestWorldMock>;
};

export const deployCompoundControllerHarvestMock = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, uniswapPath: string[]): Promise<CompoundControllerHarvestMock> => {
  return (deployContract(deployerSign, CompoundControllerHarvestMockArtifact, [poolAddress, smartYieldAddress, bondModelAddress, uniswapPath])) as Promise<CompoundControllerHarvestMock>;
};

export const deployCompoundControllerMock = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, uniswapPath: string[]): Promise<CompoundControllerMock> => {
  return (deployContract(deployerSign, CompoundControllerMockArtifact, [poolAddress, smartYieldAddress, bondModelAddress, uniswapPath])) as Promise<CompoundControllerMock>;
};

export const deployCTokenWorldMock = (deployerSign: Wallet, exchangeRateStored: BigNumberish, supplyRatePerBlock: BigNumberish, compSpeed: BigNumberish, underlyingDecimals: BigNumberish): Promise<CTokenWorldMock> => {
  return (deployContract(deployerSign, CTokenWorldMockArtifact, [exchangeRateStored, supplyRatePerBlock, compSpeed, underlyingDecimals])) as Promise<CTokenWorldMock>;
};

export const deployATokenWorldMock = (deployerSign: Wallet, liquidityIndex_: BigNumberish, currentLiquidityRate_: BigNumberish, underlyingDecimals: BigNumberish): Promise<ATokenWorldMock> => {
  return (deployContract(deployerSign, ATokenWorldMockArtifact, [liquidityIndex_, currentLiquidityRate_, underlyingDecimals])) as Promise<ATokenWorldMock>;
};

export const deployMathTests = (deployerSign: Wallet): Promise<MathTests> => {
  return (deployContract(deployerSign, MathTestsArtifact, [])) as Promise<MathTests>;
};
