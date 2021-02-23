import { deployContract } from 'ethereum-waffle';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { toBN } from './misc';

import ClockMockArtifact from '../../artifacts/contracts/mocks/ClockMock.sol/ClockMock.json';
import { ClockMock } from '@typechain/ClockMock';

import SmartYieldArtifact from '../../artifacts/contracts/SmartYield.sol/SmartYield.json';
import { SmartYield } from '@typechain/SmartYield';

import Erc20MockArtifact from '../../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { Erc20Mock } from '@typechain/Erc20Mock';

import ComptrollerMockArtifact from '../../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
import { ComptrollerMock } from '@typechain/ComptrollerMock';

import CTokenMockArtifact from '../../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import { CTokenMock } from '@typechain/CTokenMock';

import CTokenDumpMockArtifact from '../../artifacts/contracts/mocks/compound-finance/CTokenDumbMock.sol/CTokenDumbMock.json';
import { CTokenDumbMock } from '@typechain/CTokenDumbMock';

import CTokenYieldingMockArtifact from '../../artifacts/contracts/mocks/compound-finance/CTokenYieldingMock.sol/CTokenYieldingMock.json';
import { CTokenYieldingMock } from '@typechain/CTokenYieldingMock';

import YieldOracleArtifact from './../../artifacts/contracts/oracle/YieldOracle.sol/YieldOracle.json';
import { YieldOracle } from '@typechain/YieldOracle';
import { IYieldOraclelizable } from '@typechain/IYieldOraclelizable';

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

import SmartYieldForModelMockArtifact from './../../artifacts/contracts/mocks/barnbridge/SmartYieldForModelMock.sol/SmartYieldForModelMock.json';
import { SmartYieldForModelMock } from '@typechain/SmartYieldForModelMock';

import BondModelMockArtifact from './../../artifacts/contracts/mocks/barnbridge/BondModelMock.sol/BondModelMock.json';
import { BondModelMock } from '@typechain/BondModelMock';

import CompoundProviderMockCompRewardExpectedArtifact from './../../artifacts/contracts/mocks/barnbridge/CompoundProviderMockCompRewardExpected.sol/CompoundProviderMockCompRewardExpected.json';
import { CompoundProviderMockCompRewardExpected } from '@typechain/CompoundProviderMockCompRewardExpected';

import CompoundProviderMockCompHarvestExpectedArtifact from './../../artifacts/contracts/mocks/barnbridge/harvest/CompoundProviderMockCompHarvestExpected.sol/CompoundProviderMockCompHarvestExpected.json';
import { CompoundProviderMockCompHarvestExpected } from '@typechain/CompoundProviderMockCompHarvestExpected';

import CompoundProviderMockArtifact from './../../artifacts/contracts/mocks/barnbridge/CompoundProviderMock.sol/CompoundProviderMock.json';
import { CompoundProviderMock } from '@typechain/CompoundProviderMock';

import BondModelV1Artifact from './../../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
import { BondModelV1 } from '@typechain/BondModelV1';

import UniswapMockArtifact from './../../artifacts/contracts/mocks/uniswap/UniswapMock.sol/UniswapMock.json';
import { UniswapMock } from '@typechain/UniswapMock';

import CompoundProviderArtifact from './../../artifacts/contracts/providers/CompoundProvider.sol/CompoundProvider.json';
import { CompoundProvider } from '@typechain/CompoundProvider';

export const deployClockMock = (deployerSign: Wallet): Promise<ClockMock> => {
  return (deployContract(deployerSign, ClockMockArtifact, [])) as Promise<ClockMock>;
};

export const deployUnderlying = (deployerSign: Wallet, decimals: number): Promise<Erc20Mock> => {
  return (deployContract(deployerSign, Erc20MockArtifact, ['DAI mock', 'DAI', decimals])) as Promise<Erc20Mock>;
};

export const deployCompToken = (deployerSign: Wallet): Promise<Erc20Mock> => {
  return (deployContract(deployerSign, Erc20MockArtifact, ['COMP mock', 'COMP', 18])) as Promise<Erc20Mock>;
};

export const deployCompComptroller = (deployerSign: Wallet): Promise<ComptrollerMock> => {
  return (deployContract(deployerSign, ComptrollerMockArtifact, [])) as Promise<ComptrollerMock>;
};

export const deployCompCTokenDump = (deployerSign: Wallet, underlying: Erc20Mock, comptroller: ComptrollerMock): Promise<CTokenDumbMock> => {
  return (deployContract(deployerSign, CTokenDumpMockArtifact, [underlying.address, comptroller.address])) as Promise<CTokenDumbMock>;
};

export const deployCompCToken = (deployerSign: Wallet): Promise<CTokenMock> => {
  return (deployContract(deployerSign, CTokenMockArtifact, [])) as Promise<CTokenMock>;
};

export const deployCompCTokenYielding = (deployerSign: Wallet, underlying: Erc20Mock, comptroller: ComptrollerMock, clock: ClockMock, exchangeRateStored: BN | number): Promise<CTokenYieldingMock> => {
  exchangeRateStored = toBN(exchangeRateStored);
  return (deployContract(deployerSign, CTokenYieldingMockArtifact, [underlying.address, comptroller.address, clock.address, exchangeRateStored])) as Promise<CTokenYieldingMock>;
};

export const deployYieldOracle = (deployerSign: Wallet, pool: IYieldOraclelizable, windowSize: number, granularity: number): Promise<YieldOracle> => {
  return (deployContract(deployerSign, YieldOracleArtifact, [pool.address, windowSize, granularity])) as Promise<YieldOracle>;
};

export const deployYieldOracleMock = (deployerSign: Wallet): Promise<YieldOracleMock> => {
  return (deployContract(deployerSign, YieldOracleMockArtifact, [])) as Promise<YieldOracleMock>;
};

export const deployCompoundController = (deployerSign: Wallet, uniswapAddress = '0x0000000000000000000000000000000000000000', uniswapPath: string[] = []): Promise<CompoundController> => {
  return (deployContract(deployerSign, CompoundControllerArtifact, [uniswapAddress, uniswapPath])) as Promise<CompoundController>;
};

export const deployJuniorBondMock = (deployerSign: Wallet, smartYield: SmartYield): Promise<JuniorBond> => {
  return (deployContract(deployerSign, JuniorBondArtifact, [smartYield.address, 'jBOND mock', 'jBOND'])) as Promise<JuniorBond>;
};

export const deploySeniorBondMock = (deployerSign: Wallet, smartYield: SmartYield): Promise<SeniorBond> => {
  return (deployContract(deployerSign, SeniorBondArtifact, [smartYield.address, 'sBOND mock', 'sBOND'])) as Promise<SeniorBond>;
};

export const deploySmartYieldMock = (deployerSign: Wallet, clock: ClockMock): Promise<SmartYieldMock> => {
  return (deployContract(deployerSign, SmartYieldMockArtifact, [clock.address])) as Promise<SmartYieldMock>;
};

export const deploySmartYieldForModel = (deployerSign: Wallet, clock: ClockMock): Promise<SmartYieldForModelMock> => {
  return (deployContract(deployerSign, SmartYieldForModelMockArtifact, [clock.address])) as Promise<SmartYieldForModelMock>;
};

export const deployBondModelMock = (deployerSign: Wallet): Promise<BondModelMock> => {
  return (deployContract(deployerSign, BondModelMockArtifact, [])) as Promise<BondModelMock>;
};

export const deployBondModel = (deployerSign: Wallet): Promise<BondModelV1> => {
  return (deployContract(deployerSign, BondModelV1Artifact, [])) as Promise<BondModelV1>;
};

export const deployCompoundProviderMock = (deployerSign: Wallet, clock: ClockMock): Promise<CompoundProviderMock> => {
  return (deployContract(deployerSign, CompoundProviderMockArtifact, [clock.address])) as Promise<CompoundProviderMock>;
};

export const deployCompoundProviderMockCompRewardExpected = (deployerSign: Wallet, clock: ClockMock): Promise<CompoundProviderMockCompRewardExpected> => {
  return (deployContract(deployerSign, CompoundProviderMockCompRewardExpectedArtifact, [clock.address])) as Promise<CompoundProviderMockCompRewardExpected>;
};

export const deployUniswapMock = (deployerSign: Wallet): Promise<UniswapMock> => {
  return (deployContract(deployerSign, UniswapMockArtifact, [])) as Promise<UniswapMock>;
};

export const deployCompoundProvider = (deployerSign: Wallet): Promise<CompoundProvider> => {
  return (deployContract(deployerSign, CompoundProviderArtifact, [])) as Promise<CompoundProvider>;
};

export const deployCompoundProviderMockCompHarvestExpected = (deployerSign: Wallet): Promise<CompoundProviderMockCompHarvestExpected> => {
  return (deployContract(deployerSign, CompoundProviderMockCompHarvestExpectedArtifact, [])) as Promise<CompoundProviderMockCompHarvestExpected>;
};

export const deploySmartYield = (deployerSign: Wallet, name: string, symbol: string, decimals: BN): Promise<SmartYield> => {
  return (deployContract(deployerSign, SmartYieldArtifact, [name, symbol, decimals])) as Promise<SmartYield>;
};

export const deploySeniorBond = (deployerSign: Wallet, smartYield: SmartYield, name: string, symbol: string): Promise<SeniorBond> => {
  return (deployContract(deployerSign, SeniorBondArtifact, [smartYield.address, name, symbol])) as Promise<SeniorBond>;
};

export const deployJuniorBond = (deployerSign: Wallet, smartYield: SmartYield, name: string, symbol: string): Promise<JuniorBond> => {
  return (deployContract(deployerSign, JuniorBondArtifact, [smartYield.address, name, symbol])) as Promise<JuniorBond>;
};
