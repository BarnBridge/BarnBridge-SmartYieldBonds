import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN, Contract } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e18j, e6, deployJuniorBond, deploySeniorBond, deployYieldOracle, deploySmartYield, toBN, forceNextTime, mineBlocks, dumpSeniorBond, sellTokens, TIME_IN_FUTURE, redeemBond, redeemJuniorBond, dailyRate2APYCompounding, deployCreamProvider, deployCreamController, deployBondModelV2Compounded } from '@testhelp/index';

import { ERC20Factory } from '@typechain/ERC20Factory';
import { SmartYield } from '@typechain/SmartYield';
import { ERC20 } from '@typechain/ERC20';
import { YieldOracle } from '@typechain/YieldOracle';
//import { ILendingPoolFactory } from '@typechain/ILendingPoolFactory';
import { ICrCTokenFactory } from '@typechain/ICrCTokenFactory';
import { IERC20Factory } from '@typechain/IERC20Factory';
//import { IStakedTokenIncentivesControllerFactory } from '@typechain/IStakedTokenIncentivesControllerFactory';
import { IIdleToken } from '@typechain/IIdleToken';
import { IdleProvider } from '@typechain/IdleProvider';
import { IdleController } from '@typechain/IdleController';

const A_HOUR = 60 * 60;
const A_DAY = 24 * A_HOUR;

const seniorBondCONF = { name: 'BarnBridge aUSDT sBOND', symbol: 'bbsaUSDT' };
const juniorBondCONF = { name: 'BarnBridge aUSDT jBOND', symbol: 'bbjaUSDT' };
const juniorTokenCONF = { name: 'BarnBridge aUSDT', symbol: 'bbaUSDT' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

const BLOCKS_A_PERIOD = 4 * oracleCONF.windowSize / oracleCONF.granularity / 60;
const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

// barnbridge
const decimals = 6; // same as USDT

// barnbridge
const decimals = 6; // same as USDT

// externals ---

// cream
const crUSDT = '0x797AAB1ce7c01eB727ab980762bA88e7133d2157';

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

const USDTwhale = '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503';
