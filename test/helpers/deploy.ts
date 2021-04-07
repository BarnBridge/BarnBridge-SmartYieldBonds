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

import JuniorBondArtifact from './../../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
import { JuniorBond } from '@typechain/JuniorBond';

import SeniorBondArtifact from './../../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
import { SeniorBond } from '@typechain/SeniorBond';

import SmartYieldMockArtifact from './../../artifacts/contracts/mocks/barnbridge/SmartYieldMock.sol/SmartYieldMock.json';
import { SmartYieldMock } from '@typechain/SmartYieldMock';

import BondModelV1Artifact from './../../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import { BondModelV1 } from '@typechain/BondModelV1';

import UniswapMockArtifact from './../../artifacts/contracts/mocks/uniswap/UniswapMock.sol/UniswapMock.json';
import { UniswapMock } from '@typechain/UniswapMock';

import CompoundProviderArtifact from './../../artifacts/contracts/providers/CompoundProvider.sol/CompoundProvider.json';
import { CompoundProvider } from '@typechain/CompoundProvider';

import Mai3ProviderArtifact from './../../artifacts/contracts/providers/Mai3Provider.sol/Mai3Provider.json';
import { Mai3Provider } from '@typechain/Mai3Provider';

import Mai3ControllerArtifact from './../../artifacts/contracts/providers/Mai3Controller.sol/Mai3Controller.json';
import { Mai3Controller } from '@typechain/Mai3Controller';

import SignedYieldOracleArtifact from './../../artifacts/contracts/oracle/SignedYieldOracle.sol/SignedYieldOracle.json';
import { SignedYieldOracle } from '@typechain/SignedYieldOracle';

// ---- mocks

import SignedYieldOracleMockArtifact from './../../artifacts/contracts/mocks/barnbridge/SignedYieldOralceMock.sol/SignedYieldOracleMock.json';
import { SignedYieldOracleMock } from '@typechain/SignedYieldOracleMock';

import HarvestWorldMockArtifact from './../../artifacts/contracts/mocks/barnbridge/harvest/HarvestWorldMock.sol/HarvestWorldMock.json';
import { HarvestWorldMock } from '@typechain/HarvestWorldMock';

import CompoundControllerHarvestMockArtifact from './../../artifacts/contracts/mocks/barnbridge/harvest/CompoundControllerHarvestMock.sol/CompoundControllerHarvestMock.json';
import { CompoundControllerHarvestMock } from '@typechain/CompoundControllerHarvestMock';

import CompoundControllerMockArtifact from './../../artifacts/contracts/mocks/barnbridge/CompoundControllerMock.sol/CompoundControllerMock.json';
import { CompoundControllerMock } from '@typechain/CompoundControllerMock';

import CTokenWorldMockArtifact from './../../artifacts/contracts/mocks/compound-finance/CTokenWorldMock.sol/CTokenWorldMock.json';
import { CTokenWorldMock } from '@typechain/CTokenWorldMock';

// / --- mocks

import MathTestsArtifact from './../../artifacts/contracts/mocks/barnbridge/MathTests.sol/MathTests.json';
import { MathTests } from '@typechain/MathTests';

// ---mocks
import Mai3WorldMockArtifact from './../../artifacts/contracts/mocks/mai3/Mai3WorldMock.sol/Mai3WorldMock.json';
import { Mai3WorldMock } from '@typechain/Mai3WorldMock';

import Mai3ControllerMockArtifact from './../../artifacts/contracts/mocks/mai3/Mai3ControllerMock.sol/Mai3ControllerMock.json';
import { Mai3ControllerMock } from '@typechain/Mai3ControllerMock';



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

export const deployUniswapMock = (deployerSign: Wallet): Promise<UniswapMock> => {
  return (deployContract(deployerSign, UniswapMockArtifact, [])) as Promise<UniswapMock>;
};

export const deployCompoundProvider = (deployerSign: Wallet, cTokenAddress: string): Promise<CompoundProvider> => {
  return (deployContract(deployerSign, CompoundProviderArtifact, [cTokenAddress])) as Promise<CompoundProvider>;
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

export const deployMathTests = (deployerSign: Wallet): Promise<MathTests> => {
  return (deployContract(deployerSign, MathTestsArtifact, [])) as Promise<MathTests>;
};

export const deployMai3WorldMock = (deployerSign: Wallet, rewardRate: BigNumberish, removePenaltyRate: BigNumberish): Promise<Mai3WorldMock> => {
  return (deployContract(deployerSign, Mai3WorldMockArtifact, [rewardRate, removePenaltyRate])) as Promise<Mai3WorldMock>;
}

export const deployMai3Provider = (deployerSign: Wallet, mai3LiquidityPoolAddress: string): Promise<Mai3Provider> => {
  return (deployContract(deployerSign, Mai3ProviderArtifact, [mai3LiquidityPoolAddress])) as Promise<Mai3Provider>;
};

export const deployMai3ControllerMock = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, uniswapPath: string[], mcbOracleAddress: string, initialDailySupplyRate: BigNumberish): Promise<Mai3ControllerMock> => {
  return (deployContract(deployerSign, Mai3ControllerMockArtifact, [poolAddress, smartYieldAddress, bondModelAddress, uniswapPath, mcbOracleAddress, initialDailySupplyRate])) as Promise<Mai3ControllerMock>;
};

export const deploySignedYieldOracleMock = (deployerSign: Wallet, cumulativeAddress: string, windowSize: number, granularity: number): Promise<SignedYieldOracleMock> => {
  return (deployContract(deployerSign, SignedYieldOracleMockArtifact, [cumulativeAddress, windowSize, granularity])) as Promise<SignedYieldOracleMock>;
};

export const deployMai3Controller = (deployerSign: Wallet, poolAddress: string, smartYieldAddress: string, bondModelAddress: string, uniswapPath: string[], mcbOracleAddress: string, initialDailySupplyRate: BigNumberish): Promise<Mai3Controller> => {
  return (deployContract(deployerSign, Mai3ControllerArtifact, [poolAddress, smartYieldAddress, bondModelAddress, uniswapPath, mcbOracleAddress, initialDailySupplyRate])) as Promise<Mai3Controller>;
};

export const deploySignedYieldOracle = (deployerSign: Wallet, cumulativeAddress: string, windowSize: number, granularity: number): Promise<SignedYieldOracle> => {
  return (deployContract(deployerSign, SignedYieldOracleArtifact, [cumulativeAddress, windowSize, granularity])) as Promise<SignedYieldOracle>;
};