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
import { Mai3WorldMock } from '@typechain/Mai3WorldMock';

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
      smartYieldSign,
      daoSign
    };
  };
};

describe('Mai3Provider.setController()', async function() {
  it('only dao can call setController()', async function() {
    const { pool, deployerSign, userAddr, userSign } = await bbFixtures(fixture());

    await expect(pool.connect(userSign).setController(userAddr), 'should throw if not dao').revertedWith(
      'PPC: only controller/DAO'
    );
  });

  it('set new controller', async function() {
    const { pool, deployerSign, userAddr, daoSign } = await bbFixtures(fixture());

    await pool.connect(deployerSign).setController(userAddr);
    expect(await pool.callStatic.controller(), 'sould be new controller').equal(userAddr);
  });
});

describe('Mai3Provider._takeUnderlying() / Mai3Provider._sendUnderlying() ', async function() {
  it('system should be in expected state', async function() {
    const { pool, controller, underlying, mai3World, smartYieldAddr, deployerSign, userAddr } = await bbFixtures(fixture());

    expect(await pool._setup(), 'should be _setup').equal(true);
    await expect(pool.connect(deployerSign).setup(mai3World.address, userAddr), 'should throw if already setup').revertedWith(
      'PPC: already setup'
    );
    expect(await pool.smartYield(), 'should be smartYield').equal(smartYieldAddr);
    expect(await pool.controller(), 'should be controller').equal(controller.address);
    expect(await pool.shareToken(), 'should be shareToken').equal(await mai3World.shareToken());
    expect(await pool.uToken(), 'should be uToken').equal(underlying.address);
    expect(await pool.callStatic.netAssetValueCurrent(), 'inital nav should be 1').deep.equal(e18(1));
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

  it('_depositProvider deposits to provider and withdraw', async function() {
    const { pool, underlying, shareToken, smartYieldSign, mai3World } = await bbFixtures(fixture());

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
    expect(await shareToken.balanceOf(pool.address), 'pool has 0 shareToken').deep.equal(BN.from(0));

    await underlying.mintMock(pool.address, e18(1));

    expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

    const provider = pool.connect(smartYieldSign);
    await provider._depositProvider(e18(0.3), 0);
    expect(await underlying.balanceOf(pool.address), 'pool has 0.7 underlying').deep.equal(e18(0.7));
    expect(await shareToken.balanceOf(pool.address), 'pool has 0.3 shareToken').deep.equal(e18(0.3));

    await provider._depositProvider(e18(0.7), 0);
    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(e18(0));
    expect(await shareToken.balanceOf(pool.address), 'pool has 1 shareToken').deep.equal(e18(1));

    await mai3World.setRemovePenaltyRate(e18(0.2));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is 0.8').deep.equal(e18(0.8));

    await provider._withdrawProvider(e18(0.5), 0);

    expect(await underlying.balanceOf(pool.address), 'pool has 0.5 underlying').deep.equal(e18(0.5));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is (1-0.5)*0.8=0.4').deep.equal(e18(0.4));

    expect(await shareToken.balanceOf(pool.address), 'pool has 1-0.625=0.375 shareToken').deep.equal(e18(0.375));
  });
});

describe('Mai3Provider.takeFees()', async function() {
  it('transfer fee after deposting and withdrawing', async function() {
    const { userAddr, daoSign, pool, underlying, shareToken, smartYieldSign, mai3World, controller } = await bbFixtures(
      fixture()
    );

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
    expect(await shareToken.balanceOf(pool.address), 'pool has 0 shareToken').deep.equal(BN.from(0));

    await underlying.mintMock(pool.address, e18(1));

    expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

    const provider = pool.connect(smartYieldSign);
    await provider._depositProvider(e18(0.3), e18(0.01));
    expect(await underlying.balanceOf(pool.address), 'pool has 0.7 underlying').deep.equal(e18(0.7));
    expect(await shareToken.balanceOf(pool.address), 'pool has 0.3 shareToken').deep.equal(e18(0.3));

    await provider._depositProvider(e18(0.7), e18(0.01));
    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(e18(0));
    expect(await shareToken.balanceOf(pool.address), 'pool has 1 shareToken').deep.equal(e18(1));

    await mai3World.setRemovePenaltyRate(e18(0.2));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is 0.78').deep.equal(e18(0.78));

    await provider._withdrawProvider(e18(0.5), e18(0.02));

    expect(await underlying.balanceOf(pool.address), 'pool has 0.5 underlying').deep.equal(e18(0.5));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is (1-0.5)*0.8-0.04=0.36').deep.equal(e18(0.36));

    expect(await shareToken.balanceOf(pool.address), 'pool has 1-0.625=0.375 shareToken').deep.equal(e18(0.375));

    await pool.connect(smartYieldSign)._sendUnderlying(userAddr, e18(0.5));

    await controller.setFeesOwner(daoSign.address);

    await provider.transferFees();

    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(e18(0));

    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is 0.36').deep.equal(e18(0.368));

    expect(await shareToken.balanceOf(pool.address), 'pool has 0.375 * 0.9 shareToken').deep.equal(e18(0.375 * 0.9));

    expect(await underlying.balanceOf(daoSign.address), 'dao has 0.04 fees').deep.equal(e18(0.04));
  });

  it('fee is larger than underlying', async function() {
    const { userAddr, daoSign, pool, underlying, shareToken, smartYieldSign, mai3World, controller } = await bbFixtures(
      fixture()
    );
    await underlying.mintMock(pool.address, e18(1));
    const provider = pool.connect(smartYieldSign);
    await provider._depositProvider(e18(1), e18(2));
    expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(e18(0));
    expect(await pool.callStatic.underlyingBalance(), 'underlyingBalance() is 0').deep.equal(e18(0));
  });
});

describe('Provider.castVote()', async function() {
  it('only dao can call castVote()', async function() {
    const { pool, deployerSign, userAddr, userSign } = await bbFixtures(fixture());

    await expect(pool.connect(userSign).castVote(1, true), 'should throw if not dao').revertedWith('PPC: only controller/DAO');
  });

  it('cast vote', async function() {
    const { pool, deployerSign, userAddr, daoSign } = await bbFixtures(fixture());

    await pool.connect(deployerSign).castVote(1, true);
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

describe('Mai3Controller.providerRatePerDay()', async function() {
  it('use initial reward rate, zero share total', async function() {
    const { mai3World, userSign, controller, deployerSign, underlying } = await bbFixtures(fixture());

    const mcbPrice = e18(100);

    await mai3World.setRewardRate(e18(0.02));
    expect(await controller.callStatic.providerRatePerDay(), 'rate should be 0').deep.eq(e18(0));

    const maxRate = await controller.callStatic.BOND_MAX_RATE_PER_DAY();
    await controller.connect(deployerSign).setInitialDailySupplyRate(maxRate.add(1));

    expect(await controller.callStatic.providerRatePerDay(), 'rate should be maxRate').deep.eq(maxRate);
    const blocksPerDay = await controller.callStatic.BLOCKS_PER_DAY();

    await controller.connect(deployerSign).setInitialDailySupplyRate(maxRate.add(-1));
    expect(await controller.callStatic.providerRatePerDay(), 'rate should be maxRate-1').deep.eq(maxRate.sub(1));

    const u = e18(10000000000);
    await underlying.mintMock(userSign.address, u);
    await underlying.connect(userSign).approve(mai3World.address, u);
    await mai3World.connect(userSign).addLiquidity(u);

    await controller.connect(deployerSign).setInitialDailySupplyRate(e18(0.00001));

    expect(await controller.callStatic.providerRatePerDay(), 'rate should be 20 * blocksPerDay / u + 0.00001').deep.eq(
      e18(20)
        .mul(blocksPerDay)
        .div(u)
        .add(e18(0.00001))
    );
  }).timeout(500 * 1000);

  it('only dao can setInitialDailySupplyRate()', async function() {
    const { controller, deployerSign, userAddr, userSign } = await bbFixtures(fixture());

    await expect(controller.connect(userSign).setInitialDailySupplyRate(e18(0.1)), 'should throw if not dao').revertedWith(
      'GOV: not dao'
    );
  });

  it('only dao can setMCBOralce()', async function() {
    const { controller, deployerSign, userAddr, userSign } = await bbFixtures(fixture());

    await expect(controller.connect(userSign).setOracle(userAddr), 'should throw if not dao').revertedWith('GOV: not dao');
  });

  it('only dao can setMCBOralce()', async function() {
    const { controller, deployerSign, userAddr, userSign } = await bbFixtures(fixture());

    await controller.connect(deployerSign).setMCBOracle(userAddr);
    expect(await controller.callStatic.mcbSpotOracle(), 'should be address').deep.eq(userAddr);
  });

  it('cummulatives without mcb', async function() {
    const { pool, uniswapMock, mcb, mai3World, userSign, controller, deployerSign, underlying, oracle } = await bbFixtures(
      fixture()
    );

    const uniswapMockPrice = e18(0);
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);

    let u = e18(10000000000);
    await underlying.mintMock(userSign.address, u);
    await underlying.connect(userSign).approve(mai3World.address, u);
    await mai3World.connect(userSign).addLiquidity(u);

    await Promise.all([oracle.setTimestamp(1000 * A_DAY), controller.setTimestamp(1000 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '1.orcale should be not available').eq(false);
    expect(await oracle.callStatic.consultSigned(A_DAY), '1.orcale consult returns 0').deep.eq(e18(0));
    // expect(await controller.callStatic.cumulativeSupplyRate(), 'cumulative supply is 0').deep.eq(e18(0));

    // increase 0.01% profit
    let diff = u.div(10000);
    u = u.add(diff);
    await underlying.mintMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1001 * A_DAY), controller.setTimestamp(1001 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '2.orcale is not available').eq(false);

    // should not update
    await underlying.mintMock(mai3World.address, u.div(100));
    await oracle.update();
    expect(await oracle.isAvailabe(), '2(2).orcale is not available').eq(false);
    await underlying.burnMock(mai3World.address, u.div(100));

    // increase 0.01% profit
    diff = u.div(10000);
    u = u.add(diff);
    await underlying.mintMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1002 * A_DAY), controller.setTimestamp(1002 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '3.orcale is not available').eq(false);

    // increase 0.01% profit
    diff = u.div(10000);
    u = u.add(diff);

    await underlying.mintMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1003 * A_DAY), controller.setTimestamp(1003 * A_DAY)]);
    await oracle.update();

    expect(await oracle.callStatic.isAvailabe(), '4.orcale is available').eq(true);
    expect(await oracle.callStatic.consultSigned(1 * A_DAY), 'oralce').deep.eq(e18(0.0001));
    expect(await controller.callStatic.providerRatePerDay(), 'rate is 0.01').deep.eq(e18(0.0001));
  });

  it('cummulatives with mcb', async function() {
    const {
      smartYieldSign,
      mcbOracle,
      pool,
      uniswapMock,
      mcb,
      mai3World,
      userSign,
      controller,
      deployerSign,
      underlying,
      oracle
    } = await bbFixtures(fixture());
    await mcbOracle.setNewPrice(e18(10));

    const uniswapMockPrice = e18(10);
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);

    let u = e18(10000000000);
    let m = u.div(10000);
    await underlying.mintMock(pool.address, u);
    pool.connect(smartYieldSign)._depositProvider(u, 0);

    await mai3World.connect(deployerSign).setEarned(pool.address, m);

    await Promise.all([oracle.setTimestamp(1000 * A_DAY), controller.setTimestamp(1000 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '1.orcale should be not available').eq(false);
    // expect(await controller.callStatic.cumulativeSupplyRate(), 'cumulative supply is 0').deep.eq(e18(0));

    // increase 0.01% profit
    let diff = u.div(10000);
    u = u.add(diff);
    await underlying.mintMock(mai3World.address, diff);
    await mai3World.connect(deployerSign).setEarned(pool.address, m.mul(2));
    await Promise.all([oracle.setTimestamp(1001 * A_DAY), controller.setTimestamp(1001 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '2.orcale is not available').eq(false);

    let t = await controller.callStatic.prevCumulativeEarnedReward();
    // should not update
    await underlying.mintMock(mai3World.address, u.div(100));
    await oracle.update();
    expect(await oracle.isAvailabe(), '2(2).orcale is not available').eq(false);
    await underlying.burnMock(mai3World.address, u.div(100));

    // increase 0.01% profit
    diff = u.div(10000);
    u = u.add(diff);
    await underlying.mintMock(mai3World.address, diff);
    await mai3World.connect(deployerSign).setEarned(pool.address, m.mul(3));
    await Promise.all([oracle.setTimestamp(1002 * A_DAY), controller.setTimestamp(1002 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '3.orcale is not available').eq(false);

    t = await controller.callStatic.prevCumulativeEarnedReward();

    // increase 0.01% profit
    diff = u.div(10000);
    u = u.add(diff);
    await underlying.mintMock(mai3World.address, diff);
    await mai3World.connect(deployerSign).setEarned(pool.address, m.mul(4));
    await Promise.all([oracle.setTimestamp(1003 * A_DAY), controller.setTimestamp(1003 * A_DAY)]);
    await oracle.update();

    expect(await oracle.callStatic.isAvailabe(), '4.orcale is available').eq(true);
    expect(await oracle.callStatic.consultSigned(1 * A_DAY), 'oralce').deep.eq('195990401279840');
    expect(await controller.callStatic.providerRatePerDay(), 'rate is 195990401279840').deep.eq('195990401279840');
  });

  it('cummulatives negative', async function() {
    const { pool, uniswapMock, mcb, mai3World, userSign, controller, deployerSign, underlying, oracle } = await bbFixtures(
      fixture()
    );

    const uniswapMockPrice = e18(0);
    await uniswapMock.setup(mcb.address, underlying.address, uniswapMockPrice);

    let u = e18(10000000000);
    await underlying.mintMock(userSign.address, u);
    await underlying.connect(userSign).approve(mai3World.address, u);
    await mai3World.connect(userSign).addLiquidity(u);

    await Promise.all([oracle.setTimestamp(1000 * A_DAY), controller.setTimestamp(1000 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '1.orcale should be not available').eq(false);
    // expect(await controller.callStatic.cumulativeSupplyRate(), 'cumulative supply is 0').deep.eq(e18(0));

    //  0.01% loss
    let diff = u.div(10000);
    u = u.sub(diff);
    await underlying.burnMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1001 * A_DAY), controller.setTimestamp(1001 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '2.orcale is not available').eq(false);

    // decrese 0.01% loss
    diff = u.div(10000);
    u = u.sub(diff);
    await underlying.burnMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1002 * A_DAY), controller.setTimestamp(1002 * A_DAY)]);
    await oracle.update();
    expect(await oracle.isAvailabe(), '3.orcale is not available').eq(false);

    // decrease 0.01% profit
    diff = u.div(10000);
    u = u.sub(diff);

    await underlying.burnMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1003 * A_DAY), controller.setTimestamp(1003 * A_DAY)]);
    await oracle.update();

    expect(await oracle.callStatic.isAvailabe(), '4.orcale is available').eq(true);
    expect(await oracle.callStatic.consultSigned(1 * A_DAY), 'oralce').deep.eq(e18(-0.0001));
    expect(await controller.callStatic.providerRatePerDay(), 'rate is 0.01').deep.eq(e18(0));

    // increase 0.05% profit
    diff = u.div(10000).mul(5);
    u = u.add(diff);

    100000000000000;
    5000000000000000;

    await underlying.mintMock(mai3World.address, diff);
    await Promise.all([oracle.setTimestamp(1004 * A_DAY), controller.setTimestamp(1004 * A_DAY)]);
    await oracle.update();

    //0 -0.01% -0.01% -0.01% 0.05%
    //0 -0.02% -0.03% -0.04% 0.01%
    // [0.01% - (-0.02%)] / 3 = 0.01%
    expect(await oracle.callStatic.isAvailabe(), '5.orcale is available').eq(true);
    expect(await oracle.callStatic.consultSigned(1 * A_DAY), 'oralce').deep.eq(e18(0.0001));
    expect(await controller.callStatic.providerRatePerDay(), 'rate is 0.01%').deep.eq(e18(0.0001));
  });
});
