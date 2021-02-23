import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e6, deployCompoundController, deployJuniorBond, deploySeniorBond, deployYieldOracle, currentTime, START_TIME, deploySmartYield, deployBondModel, deployCompoundProvider, A_DAY, toBN, deployCompoundProviderMockCompHarvestExpected } from '@testhelp/index';

import { Erc20Factory } from '@typechain/Erc20Factory';
import { IcTokenFactory } from '@typechain/IcTokenFactory';
import { IcToken } from '@typechain/IcToken';
import { IComptrollerFactory } from '@typechain/IComptrollerFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundProvider } from '@typechain/CompoundProvider';
import { Erc20 } from '@typechain/Erc20';

const BLOCKS_A_HOUR = 4 * 60;
const BLOCKS_A_DAY = 24 * BLOCKS_A_HOUR;

const A_HOUR = 60 * 60;

const seniorBondCONF = { name: 'BarnBridge cUSDC sBOND', symbol: 'bbscUSDC' };
const juniorBondCONF = { name: 'BarnBridge cUSDC jBOND', symbol: 'bbjcUSDC' };
const juniorTokenCONF = { name: 'BarnBridge cUSDC', symbol: 'bbcUSDC' };

const oracleCONF = { windowSize: A_HOUR, granularity: 4 };

// barnbridge
const decimals = 6; // same as USDC

// externals ---

// compound
const cUSDC = '0x39AA39c021dfbaE8faC545936693aC917d5E7563';
const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';
const cComptroller = '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B';

// uniswap https://uniswap.org/docs/v2/smart-contracts/router02/
const uniswapRouter = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const uniswapPath = [COMP, WETH, USDC];

const USDCwhale = '0x55FE002aefF02F77364de339a1292923A15844B8';

const moveTime = (cToken: IcToken, whale: Wallet) => {
  return async (seconds: number | BN | BNj): Promise<void> => {
    seconds = BN.from(seconds.toString());
    await ethers.provider.send('evm_increaseTime', [seconds.toNumber()]);
    await cToken.connect(whale).mint(BN.from(1));
  };
};

const mineBlocks = (cToken: IcToken, whale: Wallet) => {
  return async (blocks: number): Promise<void> => {
    const calls = Array(Math.floor(blocks)).fill(0).map(i => {
      return ethers.provider.send('evm_mine', []);
    });
    await Promise.all(calls);
    await cToken.connect(whale).mint(BN.from(1));
  };
};

const currentBlock = () => {
  return async () => {
    return await ethers.provider.getBlock('latest');
  };
};

const impersonate = (ethWallet: Signer) => {
  return async (addr: string) => {
    await ethWallet.sendTransaction({
      to: addr,
      value: e18(1),
    });
    await ethers.provider.send('hardhat_impersonateAccount', [addr]);
    return await ethers.provider.getSigner(addr);
  };
};

export const buyTokens = (smartYield: SmartYield, pool: CompoundProvider, underlying: Erc20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await smartYield.connect(user).buyTokens(amountUnderlying, 1, currentTime().add(20));
  };
};

export const mintCtoken = (cToken: IcToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).mint(underlyingAmount_);
  };
};

export const redeemCtoken = (cToken: IcToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).redeemUnderlying(underlyingAmount_);
  };
};

 const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const whaleSign = await impersonate(deployerSign)(USDCwhale);

    const underlying = Erc20Factory.connect(USDC, deployerSign);
    const cToken = IcTokenFactory.connect(cUSDC, deployerSign);
    const comp = Erc20Factory.connect(COMP, deployerSign);
    const compoundComptroller = IComptrollerFactory.connect(cComptroller, deployerSign);

    await underlying.connect(whaleSign).approve(cToken.address, BN.from(e18(e18(e18(1)))));

    const [controller, bondModel, pool, smartYield] = await Promise.all([
      deployCompoundController(deployerSign, uniswapRouter, uniswapPath),
      deployBondModel(deployerSign),
      deployCompoundProviderMockCompHarvestExpected(deployerSign),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [seniorBond, juniorBond, oracle] = await Promise.all([
      deploySeniorBond(deployerSign, smartYield, seniorBondCONF.name, seniorBondCONF.symbol),
      deployJuniorBond(deployerSign, smartYield, juniorBondCONF.name, juniorBondCONF.symbol),
      deployYieldOracle(deployerSign, pool, oracleCONF.windowSize, oracleCONF.granularity),
    ]);

    await Promise.all([
      controller.setBondModel(bondModel.address),
      controller.setOracle(oracle.address),
      controller.setFeesOwner(deployerSign.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      pool.setup(smartYield.address, controller.address, cUSDC),
    ]);

    return {
      oracle, smartYield, cToken, bondModel, seniorBond, underlying, controller, pool, compoundComptroller, comp,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      whaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(cToken, whaleSign as unknown as Wallet),
      mineBlocks: mineBlocks(cToken, whaleSign as unknown as Wallet),
      currentBlock: currentBlock(),
      buyTokens: buyTokens(smartYield, pool, underlying),
      mintCtoken: mintCtoken(cToken, whaleSign as unknown as Wallet),
      redeemCtoken: redeemCtoken(cToken, whaleSign as unknown as Wallet),
    };
  };
};


describe('reward expected', async function () {

  it('works with multiple COMPOUND deposits between harvest', async function () {

    const { whaleSign, pool, cToken, comp, currentBlock, moveTime, mineBlocks, buyTokens, mintCtoken, redeemCtoken } = await bbFixtures(fixture());

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    await mineBlocks(BLOCKS_A_DAY);

    await mintCtoken(e6(80_000_000));

    await mineBlocks(BLOCKS_A_DAY);

    await redeemCtoken(e6(20_000_000));

    await mineBlocks(BLOCKS_A_DAY);

    await pool.harvest();

    await mineBlocks(BLOCKS_A_DAY);

    await mintCtoken(e6(10_000_000));

    await mineBlocks(BLOCKS_A_DAY);

    await redeemCtoken(e6(50_000_000));

    await mineBlocks(BLOCKS_A_DAY);

    await pool.connect(whaleSign).transferFees();

    await mineBlocks(BLOCKS_A_DAY);

    const expectedComp = await pool.compRewardExpected();

    await pool.harvest();
  }).timeout(500 * 1000);

  it('works with multiple SY deposits between harvest', async function () {

    const { whaleSign, pool, cToken, comp, currentBlock, moveTime, mineBlocks, buyTokens } = await bbFixtures(fixture());

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    await mineBlocks(BLOCKS_A_DAY);

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    await pool.harvest();

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    await buyTokens(whaleSign as unknown as Wallet, 100_000 * 10**6);

    await mineBlocks(BLOCKS_A_DAY);

    await buyTokens(whaleSign as unknown as Wallet, 300_000 * 10**6);

    await mineBlocks(BLOCKS_A_DAY);

    await buyTokens(whaleSign as unknown as Wallet, 50_000 * 10**6);

    await pool.connect(whaleSign).transferFees();

    await mineBlocks(BLOCKS_A_DAY);

    await pool.harvest();

  }).timeout(500 * 1000);

});
