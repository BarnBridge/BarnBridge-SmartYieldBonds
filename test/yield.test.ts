// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN } from '@testhelp/index';

import BondModelMockArtifact from '../artifacts/contracts/mocks/barnbridge/BondModelMock.sol/BondModelMock.json';
import BondTokenMockArtifact from '../artifacts/contracts/mocks/barnbridge/BondTokenMock.sol/BondTokenMock.json';
import Erc20MockArtifact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
import CTokenMockArtifact from '../artifacts/contracts/mocks/compound-finance/CTokenMock.sol/CTokenMock.json';
import SmartYieldPoolCompoundMockArtifact from '../artifacts/contracts/mocks/barnbridge/SmartYieldPoolCompoundMock.sol/SmartYieldPoolCompoundMock.json';
import YieldOracleMockArtifact from '../artifacts/contracts/mocks/barnbridge/YieldOracleMock.sol/YieldOracleMock.json';

import { YieldOracleMock } from '@typechain/YieldOracleMock';
import { SmartYieldPoolCompoundMock } from '@typechain/SmartYieldPoolCompoundMock';
import { BondModelMock } from '@typechain/BondModelMock';
import { BondTokenMock } from '@typechain/BondTokenMock';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { CTokenMock } from '@typechain/CTokenMock';


// TODO:
