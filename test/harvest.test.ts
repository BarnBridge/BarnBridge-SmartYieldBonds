import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN, wordlists } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { ethers } from 'hardhat';

import { bbFixtures, e18, e6, toBN, deployHarvestMockWorld, deployCompoundControllerHarvestMock, TIME_IN_FUTURE, deployBondModel } from '@testhelp/index';

import { ERC20Factory } from '@typechain/Erc20Factory';
import { ICTokenFactory } from '@typechain/IcTokenFactory';
import { ICToken } from '@typechain/ICToken';
import { IComptrollerFactory } from '@typechain/IComptrollerFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundProvider } from '@typechain/CompoundProvider';
import { ERC20 } from '@typechain/ERC20';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { UniswapMockFactory } from '@typechain/UniswapMockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';

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
const COMPwhale = '0x7587cAefc8096f5F40ACB83A09Df031a018C66ec';

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

export const buyTokens = (smartYield: SmartYield, pool: CompoundProvider, underlying: ERC20) => {
  return async (user: Wallet, amountUnderlying: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await smartYield.connect(user).buyTokens(amountUnderlying, 1, TIME_IN_FUTURE);
  };
};

export const mintCtoken = (cToken: ICToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).mint(underlyingAmount_);
  };
};

export const redeemCtoken = (cToken: ICToken, whale: Wallet) => {
  return async (underlyingAmount_: BN): Promise<void> => {
    await cToken.connect(whale).redeemUnderlying(underlyingAmount_);
  };
};

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const usdcWhaleSign = await impersonate(deployerSign)(USDCwhale);
    const compWhaleSign = await impersonate(deployerSign)(COMPwhale);

    const [harvestWorld, bondModel] = await Promise.all([
      deployHarvestMockWorld(deployerSign, 6),
      deployBondModel(deployerSign),
    ]);

    const underlying = Erc20MockFactory.connect(await harvestWorld.callStatic.uTokenAddress(), deployerSign);
    const comp = Erc20MockFactory.connect(await harvestWorld.callStatic.compAddress(), deployerSign);

    const [controllerMocked] = await Promise.all([
      deployCompoundControllerHarvestMock(deployerSign, harvestWorld.address, harvestWorld.address, bondModel.address, [comp.address, WETH, underlying.address]),
    ]);

    await controllerMocked.updateAllowances();
    await harvestWorld.setMockAllowances(controllerMocked.address);

    const uniswapMock = UniswapMockFactory.connect(await controllerMocked.callStatic.uniswapRouter(), deployerSign);
    const compOracleMock = CompOracleMockFactory.connect(await harvestWorld.callStatic.oracle(), deployerSign);

    return {
      harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      usdcWhaleSign,
      junior1, junior2, junior3, senior1, senior2, senior3,
    };
  };
};

describe('CompoundController.harvest()', async function () {

  it('happy path with full harvest', async function () {
    const { harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp, deployerSign } = await bbFixtures(fixture());

    const compOraclePrice = BN.from('400000000');
    const cusdcUnderlyingPrice = BN.from('1000000000000000000000000000000');

    const uniswapMockPrice = compOraclePrice;

    await harvestWorld.setMockAmounts(e18(5));

    await compOracleMock.setMockReturns(compOraclePrice, cusdcUnderlyingPrice);
    await uniswapMock.setup(comp.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(e18(5), e6(1920), [comp.address, WETH, underlying.address], controllerMocked.address);

    const { compGot, underlyingHarvestReward } = await controllerMocked.callStatic.harvest(0);
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e6(80));
    expect(compGot, 'comp got reward').deep.equal(e18(5));

    await controllerMocked.harvest(0);

    expect(await harvestWorld.callStatic.depositedUnderlyingAmount(), 'harvest deposited amount').deep.equal(e6(1920));
    expect(await harvestWorld.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e6(0));
    expect(await underlying.callStatic.balanceOf(controllerMocked.address), 'no underlying on controller after harvest').deep.equal(BN.from(0));
    expect(await comp.callStatic.balanceOf(controllerMocked.address), 'no comp on controller after harvest').deep.equal(BN.from(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e6(80));
    expect(await underlying.callStatic.balanceOf(await harvestWorld.address), 'pool gets underlying poolShare').deep.equal(e6(1920));

  }).timeout(500 * 1000);

  it('happy path with partial harvest', async function () {
    const { harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp, deployerSign } = await bbFixtures(fixture());

    const compOraclePrice = BN.from('400000000');
    const cusdcUnderlyingPrice = BN.from('1000000000000000000000000000000');

    const uniswapMockPrice = compOraclePrice;

    await harvestWorld.setMockAmounts(e18(5));

    await compOracleMock.setMockReturns(compOraclePrice, cusdcUnderlyingPrice);
    await uniswapMock.setup(comp.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(e18(2), e6(768), [comp.address, WETH, underlying.address], controllerMocked.address);


    const { compGot, underlyingHarvestReward } = await controllerMocked.callStatic.harvest(e18(2));
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e6(32));
    expect(compGot, 'comp got reward').deep.equal(e18(5));

    await controllerMocked.harvest(e18(2));

    expect(await harvestWorld.callStatic.depositedUnderlyingAmount(), 'harvest deposited amount').deep.equal(e6(768));
    expect(await harvestWorld.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e6(0));
    expect(await underlying.callStatic.balanceOf(controllerMocked.address), 'no underlying on controller after harvest').deep.equal(BN.from(0));
    expect(await comp.callStatic.balanceOf(controllerMocked.address), 'no comp on controller after harvest').deep.equal(e18(3));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e6(32));
    expect(await underlying.callStatic.balanceOf(await harvestWorld.address), 'pool gets underlying poolShare').deep.equal(e6(768));

    await harvestWorld.setMockAmounts(0);

    await uniswapMock.expectCallSwapExactTokensForTokens(e18(3), e6(1152), [comp.address, WETH, underlying.address], controllerMocked.address);

    const { compGot: compGot2, underlyingHarvestReward: underlyingHarvestReward2 } = await controllerMocked.callStatic.harvest(e18(3));
    expect(underlyingHarvestReward2, 'harvest reward').deep.equal(e6(48));
    expect(compGot2, 'comp got reward').deep.equal(e18(3));

    await controllerMocked.harvest(0);

    expect(await harvestWorld.callStatic.depositedUnderlyingAmount(), 'harvest deposited amount').deep.equal(e6(768 + 1152));
    expect(await harvestWorld.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e6(0));
    expect(await underlying.callStatic.balanceOf(controllerMocked.address), 'no underlying on controller after harvest').deep.equal(BN.from(0));
    expect(await comp.callStatic.balanceOf(controllerMocked.address), 'no comp on controller after harvest').deep.equal(e18(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e6(32 + 48));
    expect(await underlying.callStatic.balanceOf(await harvestWorld.address), 'pool gets underlying poolShare').deep.equal(e6(768 + 1152));

  }).timeout(500 * 1000);

  it('happy path with more harvest than available', async function () {

    const { harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp, deployerSign } = await bbFixtures(fixture());

    const compOraclePrice = BN.from('400000000');
    const cusdcUnderlyingPrice = BN.from('1000000000000000000000000000000');

    const uniswapMockPrice = compOraclePrice;

    await harvestWorld.setMockAmounts(e18(5));

    await compOracleMock.setMockReturns(compOraclePrice, cusdcUnderlyingPrice);
    await uniswapMock.setup(comp.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(e18(5), e6(1920), [comp.address, WETH, underlying.address], controllerMocked.address);

    const { compGot, underlyingHarvestReward } = await controllerMocked.callStatic.harvest(e18(100));
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e6(80));
    expect(compGot, 'comp got reward').deep.equal(e18(5));

    await controllerMocked.harvest(e18(100));

    expect(await harvestWorld.callStatic.depositedUnderlyingAmount(), 'harvest deposited amount').deep.equal(e6(1920));
    expect(await harvestWorld.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e6(0));
    expect(await underlying.callStatic.balanceOf(controllerMocked.address), 'no underlying on controller after harvest').deep.equal(BN.from(0));
    expect(await comp.callStatic.balanceOf(controllerMocked.address), 'no comp on controller after harvest').deep.equal(BN.from(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e6(80));
    expect(await underlying.callStatic.balanceOf(await harvestWorld.address), 'pool gets underlying poolShare').deep.equal(e6(1920));

  }).timeout(500 * 1000);

  it('reverts if uniswap price/slippage is below/more than HARVEST_COST', async function () {

    const { harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp, deployerSign } = await bbFixtures(fixture());

    const compOraclePrice = BN.from('400000000');
    const cusdcUnderlyingPrice = BN.from('1000000000000000000000000000000');

    const uniswapMockPrice = BN.from('400000000').mul(e18(0.96)).div(e18(1)).sub(1);

    await harvestWorld.setMockAmounts(e18(5));

    await compOracleMock.setMockReturns(compOraclePrice, cusdcUnderlyingPrice);
    await uniswapMock.setup(comp.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(e18(5), e6(1920), [comp.address, WETH, underlying.address], controllerMocked.address);

    await expect(controllerMocked.harvest(e18(5))).revertedWith('PPC: harvest poolShare');

  }).timeout(500 * 1000);

  it('reverts if claimComp gives 0', async function () {

    const { harvestWorld, controllerMocked, uniswapMock, compOracleMock, underlying, comp, deployerSign } = await bbFixtures(fixture());

    const compOraclePrice = BN.from('400000000');
    const cusdcUnderlyingPrice = BN.from('1000000000000000000000000000000');

    const uniswapMockPrice = compOraclePrice;

    await harvestWorld.setMockAmounts(e18(0));

    await compOracleMock.setMockReturns(compOraclePrice, cusdcUnderlyingPrice);
    await uniswapMock.setup(comp.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(e18(5), e6(1920), [comp.address, WETH, underlying.address], controllerMocked.address);

    await expect(controllerMocked.harvest(e18(5))).revertedWith('PPC: harvested nothing');

  }).timeout(500 * 1000);

});
