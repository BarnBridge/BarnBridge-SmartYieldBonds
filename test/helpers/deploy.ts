import { deployContract } from 'ethereum-waffle';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import ClockMockArtifact from '../../artifacts/contracts/mocks/ClockMock.sol/ClockMock.json';
import { ClockMock } from '@typechain/ClockMock';

import { SmartYield } from '@typechain/SmartYield';

import Erc20MockArtifact from '../../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import { Erc20Mock } from '@typechain/Erc20Mock';

import ComptrollerMockArtifact from '../../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
import { ComptrollerMock } from '@typechain/ComptrollerMock';

import CTokenMockArtifact from '../../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import { CTokenMock } from '@typechain/CTokenMock';

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

import BondModelMockArtifact from './../../artifacts/contracts/mocks/barnbridge/BondModelMock.sol/BondModelMock.json';
import { BondModelMock } from '@typechain/BondModelMock';

import CompoundProviderMockArtifact from './../../artifacts/contracts/mocks/barnbridge/CompoundProviderMock.sol/CompoundProviderMock.json';
import { CompoundProviderMock } from '@typechain/CompoundProviderMock';


export const deployClockMock = (deployerSign: Wallet): Promise<ClockMock> => {
  return (deployContract(deployerSign, ClockMockArtifact, [])) as Promise<ClockMock>;
};

export const deployUnderlying = (deployerSign: Wallet, decimals: number): Promise<Erc20Mock> => {
  return (deployContract(deployerSign, Erc20MockArtifact, ['DAI mock', 'DAI', decimals])) as Promise<Erc20Mock>;
};

export const deployCompComptroller = (deployerSign: Wallet): Promise<ComptrollerMock> => {
  return (deployContract(deployerSign, ComptrollerMockArtifact, [])) as Promise<ComptrollerMock>;
};

export const deployCompCToken = (deployerSign: Wallet, underlying: Erc20Mock, comptroller: ComptrollerMock): Promise<CTokenMock> => {
  return (deployContract(deployerSign, CTokenMockArtifact, [underlying.address, comptroller.address])) as Promise<CTokenMock>;
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

export const deployJuniorBond = (deployerSign: Wallet, smartYield: SmartYield): Promise<JuniorBond> => {
  return (deployContract(deployerSign, JuniorBondArtifact, [smartYield.address, 'jBOND mock', 'jBOND'])) as Promise<JuniorBond>;
};

export const deploySeniorBond = (deployerSign: Wallet, smartYield: SmartYield): Promise<SeniorBond> => {
  return (deployContract(deployerSign, SeniorBondArtifact, [smartYield.address, 'sBOND mock', 'sBOND'])) as Promise<SeniorBond>;
};

export const deploySmartYield = (deployerSign: Wallet, clock: ClockMock): Promise<SmartYieldMock> => {
  return (deployContract(deployerSign, SmartYieldMockArtifact, [clock.address])) as Promise<SmartYieldMock>;
};

export const deployBondModelMock = (deployerSign: Wallet): Promise<BondModelMock> => {
  return (deployContract(deployerSign, BondModelMockArtifact, [])) as Promise<BondModelMock>;
};

export const deployCompoundProvider = (deployerSign: Wallet, clock: ClockMock): Promise<CompoundProviderMock> => {
  return (deployContract(deployerSign, CompoundProviderMockArtifact, [clock.address])) as Promise<CompoundProviderMock>;
};
