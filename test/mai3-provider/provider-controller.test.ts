import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import {
  bbFixtures,
  deployBondModel,
  deployMai3ControllerMock,
  deployMai3Provider,
  deployMai3WorldMock,
  deploySignedYieldOracleMock,
  e18
} from '@testhelp/index';
import { A_DAY } from '@testhelp/time';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { Mai3OracleMockFactory } from '@typechain/Mai3OracleMockFactory';
import { UniswapMockFactory } from '@typechain/UniswapMockFactory';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const oracleCONF = { windowSize: 4 * A_DAY, granularity: 4 };

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, daoSign, guardianSign, feesOwnerSign, smartYieldSign, userSign] = wallets;
    const [deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr] = await Promise.all([
      deployerSign.getAddress(),
      daoSign.getAddress(),
      guardianSign.getAddress(),
      feesOwnerSign.getAddress(),
      smartYieldSign.getAddress(),
      userSign.getAddress()
    ]);

    const [mai3World] = await Promise.all([deployMai3WorldMock(deployerSign, 0, 0)]);

    const underlying = Erc20MockFactory.connect(await mai3World.callStatic.underlying(), deployerSign);
    const mcb = Erc20MockFactory.connect(await mai3World.callStatic.mcb(), deployerSign);
    const shareToken = Erc20MockFactory.connect(await mai3World.callStatic.shareToken(), deployerSign);
    const mcbOracle = Mai3OracleMockFactory.connect(await mai3World.callStatic.mcbOracle(), deployerSign);

    const [pool, bondModel] = await Promise.all([
      deployMai3Provider(deployerSign, mai3World.address),
      deployBondModel(deployerSign)
    ]);

    const controller = await deployMai3ControllerMock(
      deployerSign,
      pool.address,
      smartYieldAddr,
      bondModel.address,
      [mcb.address, WETH, underlying.address],
      mcbOracle.address,
      0
    );

    const uniswapMock = UniswapMockFactory.connect(await controller.callStatic.uniswapRouter(), deployerSign);

    const oracle = await deploySignedYieldOracleMock(
      deployerSign,
      controller.address,
      oracleCONF.windowSize,
      oracleCONF.granularity
    );

    await Promise.all([
      controller.setOracle(oracle.address),
      pool.setup(smartYieldAddr, controller.address),
      controller.setFeeBuyJuniorToken(0)
    ]);

    return {
      uniswapMock,
      controller,
      pool,
      bondModel,
      oracle,
      underlying,
      mcb,
      mcbOracle,
      shareToken,
      mai3World,
      deployerAddr,
      daoAddr,
      guardianAddr,
      feesOwnerAddr,
      smartYieldAddr,
      userAddr,
      userSign,
      deployerSign: deployerSign as Signer,
      smartYieldSign
    };
  };
};

describe('Mai3Provider._takeUnderlying() / Mai3Provider._sendUnderlying() ', async function() {
  it('system should be in expected state', async function() {
    const { pool, controller, underlying, mai3World, smartYieldAddr } = await bbFixtures(fixture());

    expect(await pool._setup(), 'should be _setup').equal(true);
    expect(await pool.smartYield(), 'should be smartYield').equal(smartYieldAddr);
    expect(await pool.controller(), 'should be controller').equal(controller.address);
    expect(await pool.shareToken(), 'should be shareToken').equal(await mai3World.shareToken());
    expect(await pool.uToken(), 'should be uToken').equal(underlying.address);
  });

  it('only smartYield can call _takeUnderlying/_sendUnderlying', async function() {
    const { pool, deployerSign, smartYieldSign, deployerAddr } = await bbFixtures(fixture());

    await expect(pool.connect(deployerSign)._takeUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith(
      'PPC: only smartYield/controller'
    );
    await expect(pool.connect(deployerSign)._sendUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith(
      'PPC: only smartYield'
    );
    await expect(
      pool.connect(smartYieldSign)._takeUnderlying(deployerAddr, 1),
      'should not throw if smartYieldAddr'
    ).not.revertedWith('PPC: only smartYield/controller');
    await expect(
      pool.connect(smartYieldSign)._sendUnderlying(deployerAddr, 1),
      'should not throw if smartYieldAddr'
    ).not.revertedWith('PPC: only smartYield');
  });

  it('_takeUnderlying takes underlying & checks for allowance', async function() {
    const { pool, underlying, smartYieldSign, userSign, userAddr } = await bbFixtures(fixture());

    await underlying.mintMock(userAddr, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 1 underlying').deep.equal(e18(1));
    expect(await underlying.balanceOf(pool.address), 'should have 0 underlying').deep.equal(BN.from(0));

    await expect(pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1)), 'revert with no allowance').reverted;

    await underlying.connect(userSign).approve(pool.address, e18(0.5));

    await expect(pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1)), 'revert with not enought allowance').reverted;

    await underlying.connect(userSign).approve(pool.address, e18(1));

    await pool.connect(smartYieldSign)._takeUnderlying(userAddr, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 0 underlying').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(pool.address), 'should have 1 underlying').deep.equal(e18(1));
  });

  it('_sendUnderlying sends underlying', async function() {
    const { pool, underlying, smartYieldSign, userAddr } = await bbFixtures(fixture());

    await underlying.mintMock(pool.address, e18(1));
    expect(await underlying.balanceOf(userAddr), 'should have 0 underlying').deep.equal(BN.from(0));
    expect(await underlying.balanceOf(pool.address), 'should have 1 underlying').deep.equal(e18(1));

    await pool.connect(smartYieldSign)._sendUnderlying(userAddr, e18(1));

    expect(await underlying.balanceOf(userAddr), 'should have 1 underlying').deep.equal(e18(1));
    expect(await underlying.balanceOf(pool.address), 'should have 0 underlying').deep.equal(BN.from(0));
  });
});

describe('Mai3Provider._depositProvider() / Mai3Provider._withdrawProvider() ', async function() {
  it('only smartYield can call _depositProvider/_withdrawProvider', async function() {
    const { pool, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

    await expect(pool.connect(deployerSign)._depositProvider(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith(
      'PPC: only smartYield/controller'
    );
    await expect(
      pool.connect(deployerSign)._withdrawProvider(deployerAddr, 1),
      'should throw if not smartYieldAddr'
    ).revertedWith('PPC: only smartYield');
    await expect(
      pool.connect(smartYieldSign)._depositProvider(deployerAddr, 1),
      'should not throw if smartYieldAddr'
    ).not.revertedWith('PPC: only smartYield/controller');
    await expect(
      pool.connect(smartYieldSign)._withdrawProvider(deployerAddr, 1),
      'should not throw if smartYieldAddr'
    ).not.revertedWith('PPC: only smartYield');
  });

  it('_depositProvider deposits to provider', async function() {
    const { pool, underlying, shareToken, smartYieldSign, mai3World } = await bbFixtures(fixture());

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
    expect(await shareToken.balanceOf(pool.address), 'pool has 0 shareToken').deep.equal(BN.from(0));

    await underlying.mintMock(pool.address, e18(1));

    expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

    await pool.connect(smartYieldSign)._depositProvider(e18(1), 0);

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));

    expect(await shareToken.balanceOf(pool.address), 'pool has correct shareToken').deep.equal(e18(1));

    await mai3World.setRemovePenaltyRate(e18(0.2));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is 0.8').deep.equal(e18(0.8));
  });
});

describe('Mai3Controller.harvest()', async function() {
  it('happy path with full harvest', async function() {
    const { mai3World, pool, controller, uniswapMock, mcbOracle, underlying, mcb, deployerSign } = await bbFixtures(fixture());

    const mcbPrice = e18(100);

    const uniswapMockPrice = e18(99);

    await mcbOracle.setNewPrice(mcbPrice);
    await mai3World.setEarned(pool.address, e18(20));
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(
      e18(20),
      e18(1920),
      [mcb.address, WETH, underlying.address],
      controller.address
    );

    await mai3World.setRemovePenaltyRate(e18(0.2));

    const { mcbGot, underlyingHarvestReward } = await controller.callStatic.harvest(0);
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e18(60));
    expect(mcbGot, 'mcb got reward').deep.equal(e18(20));

    await controller.harvest(0);

    expect(await pool.callStatic.underlyingBalance(), 'harvest deposited amount').deep.equal(e18(1536)); // 1920*0.8
    expect(await pool.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e18(0));
    expect(await underlying.callStatic.balanceOf(controller.address), 'no underlying on controller after harvest').deep.equal(
      BN.from(0)
    );
    expect(await mcb.callStatic.balanceOf(controller.address), 'no mcb on controller after harvest').deep.equal(BN.from(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e18(60));
    expect(await underlying.callStatic.balanceOf(mai3World.address), 'mai3 gets underlying poolShare').deep.equal(e18(1920));
  }).timeout(500 * 1000);

  it('happy path with partial harvest', async function() {
    const { mai3World, pool, controller, uniswapMock, mcbOracle, underlying, mcb, deployerSign } = await bbFixtures(fixture());

    const mcbPrice = e18(100);

    const uniswapMockPrice = e18(99);

    await mcbOracle.setNewPrice(mcbPrice);
    await mai3World.setEarned(pool.address, e18(20));
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(
      e18(10),
      e18(960),
      [mcb.address, WETH, underlying.address],
      controller.address
    );

    await mai3World.setRemovePenaltyRate(e18(0.2));

    const { mcbGot, underlyingHarvestReward } = await controller.callStatic.harvest(e18(10));
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e18(30));
    expect(mcbGot, 'mcb got reward').deep.equal(e18(20));

    await controller.harvest(e18(10));

    expect(await pool.callStatic.underlyingBalance(), 'harvest deposited amount').deep.equal(e18(768)); // 960*0.8
    expect(await pool.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e18(0));
    expect(await underlying.callStatic.balanceOf(controller.address), 'no underlying on controller after harvest').deep.equal(
      BN.from(0)
    );
    expect(await mcb.callStatic.balanceOf(controller.address), 'still mcb on controller after harvest').deep.equal(e18(10));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e18(30));
    expect(await underlying.callStatic.balanceOf(mai3World.address), 'mai3 gets underlying poolShare').deep.equal(e18(960));

    await mai3World.setEarned(pool.address, e18(20));

    await uniswapMock.expectCallSwapExactTokensForTokens(
      e18(30),
      e18(2880),
      [mcb.address, WETH, underlying.address],
      controller.address
    );

    await controller.harvest(0);

    expect(await pool.callStatic.underlyingBalance(), 'harvest deposited amount').deep.equal(e18(3072)); // 3840*0.8
    expect(await pool.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e18(0));
    expect(await underlying.callStatic.balanceOf(controller.address), 'no underlying on controller after harvest').deep.equal(
      BN.from(0)
    );
    expect(await mcb.callStatic.balanceOf(controller.address), 'no mcb on controller after harvest').deep.equal(BN.from(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e18(120));
    expect(await underlying.callStatic.balanceOf(mai3World.address), 'mai3 gets underlying poolShare').deep.equal(e18(3840));

    expect(await controller.callStatic.cumulativeHarvestedReward(), 'cumulative harvested mcb').deep.equal(e18(40));
  }).timeout(500 * 1000);

  it('happy path with more harvest than available', async function() {
    const { mai3World, pool, controller, uniswapMock, mcbOracle, underlying, mcb, deployerSign } = await bbFixtures(fixture());

    const mcbPrice = e18(100);

    const uniswapMockPrice = e18(99);

    await mcbOracle.setNewPrice(mcbPrice);
    await mai3World.setEarned(pool.address, e18(20));
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(
      e18(20),
      e18(1920),
      [mcb.address, WETH, underlying.address],
      controller.address
    );

    await mai3World.setRemovePenaltyRate(e18(0.2));

    const { mcbGot, underlyingHarvestReward } = await controller.callStatic.harvest(e18(100));
    expect(underlyingHarvestReward, 'harvest reward').deep.equal(e18(60));
    expect(mcbGot, 'mcb got reward').deep.equal(e18(20));

    await controller.harvest(e18(100));

    expect(await pool.callStatic.underlyingBalance(), 'harvest deposited amount').deep.equal(e18(1536)); // 1920*0.8
    expect(await pool.callStatic.underlyingFees(), 'fees after harvest').deep.equal(e18(0));
    expect(await underlying.callStatic.balanceOf(controller.address), 'no underlying on controller after harvest').deep.equal(
      BN.from(0)
    );
    expect(await mcb.callStatic.balanceOf(controller.address), 'no mcb on controller after harvest').deep.equal(BN.from(0));

    expect(await underlying.callStatic.balanceOf(await deployerSign.getAddress()), 'caller gets rewards').deep.equal(e18(60));
    expect(await underlying.callStatic.balanceOf(mai3World.address), 'mai3 gets underlying poolShare').deep.equal(e18(1920));
  }).timeout(500 * 1000);

  it('reverts if uniswap price/slippage is below/more than HARVEST_COST', async function() {
    const { mai3World, pool, controller, uniswapMock, mcbOracle, underlying, mcb } = await bbFixtures(fixture());

    const mcbPrice = e18(100);

    const uniswapMockPrice = e18(96).sub(1);

    await mcbOracle.setNewPrice(mcbPrice);
    await mai3World.setEarned(pool.address, e18(20));
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);
    await uniswapMock.expectCallSwapExactTokensForTokens(
      e18(20),
      e18(1920),
      [mcb.address, WETH, underlying.address],
      controller.address
    );

    await expect(controller.harvest(e18(20))).revertedWith('PPC: harvest poolShare');
  }).timeout(500 * 1000);

  it('reverts if claimComp gives 0', async function() {
    const { mai3World, pool, controller } = await bbFixtures(fixture());

    await mai3World.setEarned(pool.address, e18(0));

    await expect(controller.harvest(0)).revertedWith('PPC: harvested nothing');
  }).timeout(500 * 1000);
});
