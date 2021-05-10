import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { bbFixtures, deployBondModelV2Compounded, deployCrCTokenWorldMock, deployCreamController, deployCreamProvider, deployYieldOracle, e18, u2cToken } from '@testhelp/index';
import { A_DAY } from '@testhelp/time';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { CrCTokenWorldMock } from '@typechain/CrCTokenWorldMock';

const decimals = 18;
const supplyRatePerBlock = BN.from('70103504599514576136309606'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('1036955487261449114973524155');

const oracleCONF = { windowSize: 4 * A_DAY, granularity: 4 };

const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, daoSign, guardianSign, feesOwnerSign, smartYieldSign, userSign, rewardHolderSign] = wallets;
    const [deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr, rewardHolderAddr] = await Promise.all([
      deployerSign.getAddress(),
      daoSign.getAddress(),
      guardianSign.getAddress(),
      feesOwnerSign.getAddress(),
      smartYieldSign.getAddress(),
      userSign.getAddress(),
      rewardHolderSign.getAddress(),
    ]);

    const [crctokenWorld] = await Promise.all([
      deployCrCTokenWorldMock(deployerSign, exchangeRateStored, 0, 0, decimals),
    ]);

    const underlying = Erc20MockFactory.connect(await crctokenWorld.callStatic.underlying(), deployerSign);
    const rewardToken = Erc20MockFactory.connect(await crctokenWorld.callStatic.getCompAddress(), deployerSign);

    const [pool, bondModel] = await Promise.all([
      deployCreamProvider(deployerSign, crctokenWorld.address),
      deployBondModelV2Compounded(deployerSign),
    ]);

    const [controller] = await Promise.all([
      deployCreamController(deployerSign, pool.address, smartYieldAddr, bondModel.address, rewardHolderAddr),
    ]);

    const oracle = await deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity);

    await Promise.all([
      controller.setOracle(oracle.address),
      pool.setup(smartYieldAddr, controller.address),
      controller.setFeeBuyJuniorToken(0),
      controller.setFeesOwner(feesOwnerAddr),
    ]);

    return {
      controller, pool, bondModel, oracle, underlying, crctokenWorld, rewardToken,
      deployerAddr, daoAddr, guardianAddr, feesOwnerAddr, smartYieldAddr, userAddr, rewardHolderAddr,
      userSign, rewardHolderSign,
      deployerSign: deployerSign as Signer,
      smartYieldSign,
    };
  };
};

describe('CreamProvider', async function () {

  describe('_depositProvider() / _withdrawProvider() ', async function () {

    it('system should be in expected state', async function () {

      const { pool, controller, underlying, crctokenWorld, deployerSign, smartYieldAddr, userAddr } = await bbFixtures(fixture());

      expect((await pool._setup()), 'should be _setup').equal(true);
      expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
      expect((await pool.controller()), 'should be controller').equal(controller.address);
      expect((await pool.cToken()), 'should be cToken').equal(crctokenWorld.address);
      expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    });

    it('only smartYield can call _depositProvider/_withdrawProvider', async function () {

      const { pool, controller, underlying, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

      await expect(pool.connect(deployerSign)._depositProvider(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('CrP: only smartYield/controller');
      await expect(pool.connect(deployerSign)._withdrawProvider(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('CrP: only smartYield');
      await expect(pool.connect(smartYieldSign)._depositProvider(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('CrP: only smartYield/controller');
      await expect(pool.connect(smartYieldSign)._withdrawProvider(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('CrP: only smartYield');
      await expect(pool.connect(smartYieldSign).claimRewardsTo(100, deployerAddr), 'should throw if not controller').revertedWith('CrP: only controller');
    });

    it('_depositProvider deposits to provider', async function () {

      const { pool, controller, underlying, crctokenWorld, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

      expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
      expect(await crctokenWorld.balanceOf(pool.address), 'pool has 0 aToken').deep.equal(BN.from(0));

      await underlying.mintMock(pool.address, e18(1));

      expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

      await pool.connect(smartYieldSign)._depositProvider(e18(1), 0);

      expect(await underlying.balanceOf(pool.address), 'pool has 0 underlying').deep.equal(BN.from(0));
      const expectAtokens = u2cToken(e18(1), exchangeRateStored);
      expect(await crctokenWorld.balanceOf(pool.address), 'pool has correct aToken').deep.equal(expectAtokens);

    });
  });

  describe('_takeUnderlying() / _sendUnderlying() ', async function () {

    it('system should be in expected state', async function () {

      const { pool, controller, underlying, crctokenWorld, smartYieldAddr } = await bbFixtures(fixture());

      expect((await pool._setup()), 'should be _setup').equal(true);
      expect((await pool.smartYield()), 'should be smartYield').equal(smartYieldAddr);
      expect((await pool.controller()), 'should be controller').equal(controller.address);
      expect((await pool.cToken()), 'should be cToken').equal(crctokenWorld.address);
      expect((await pool.uToken()), 'should be uToken').equal(underlying.address);
    });

    it('only smartYield can call _takeUnderlying/_sendUnderlying', async function () {

      const { pool, controller, underlying, deployerSign, smartYieldSign, deployerAddr, smartYieldAddr } = await bbFixtures(fixture());

      await expect(pool.connect(deployerSign)._takeUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('CrP: only smartYield/controller');
      await expect(pool.connect(deployerSign)._sendUnderlying(deployerAddr, 1), 'should throw if not smartYieldAddr').revertedWith('CrP: only smartYield');
      await expect(pool.connect(smartYieldSign)._takeUnderlying(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('CrP: only smartYield/controller');
      await expect(pool.connect(smartYieldSign)._sendUnderlying(deployerAddr, 1), 'should not throw if smartYieldAddr').not.revertedWith('CrP: only smartYield');
    });

    it('_takeUnderlying takes underlying & checks for allowance', async function () {

      const { pool, underlying, smartYieldSign, deployerAddr, smartYieldAddr, userSign, userAddr } = await bbFixtures(fixture());

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

    it('_sendUnderlying sends underlying', async function () {

      const { pool, underlying, smartYieldSign, deployerAddr, smartYieldAddr, userAddr } = await bbFixtures(fixture());

      await underlying.mintMock(pool.address, e18(1));
      expect(await underlying.balanceOf(userAddr), 'should have 0 underlying').deep.equal(BN.from(0));
      expect(await underlying.balanceOf(pool.address), 'should have 1 underlying').deep.equal(e18(1));

      await pool.connect(smartYieldSign)._sendUnderlying(userAddr, e18(1));

      expect(await underlying.balanceOf(userAddr), 'should have 1 underlying').deep.equal(e18(1));
      expect(await underlying.balanceOf(pool.address), 'should have 0 underlying').deep.equal(BN.from(0));
    });

  });

  describe('transferFees() ', async function () {

    it('transfers fees to feesOwner', async function () {

      const { pool, controller, underlying, smartYieldAddr, smartYieldSign, feesOwnerAddr } = await bbFixtures(fixture());

      await underlying.mintMock(pool.address, e18(1));

      expect(await underlying.balanceOf(pool.address), 'pool has 1 underlying').deep.equal(e18(1));

      await pool.connect(smartYieldSign)._depositProvider(e18(1), 1000);

      expect(await underlying.balanceOf(feesOwnerAddr), 'fee owner has nothing').deep.equal(BN.from(0));
      await pool.transferFees();
      expect(await underlying.balanceOf(feesOwnerAddr), 'fee owner has correct fees').deep.equal(BN.from(1000));

    });

  });

  describe('claimRewardsTo() ', async function () {

    it('transfer rewards to rewardsColector', async function () {

      const { pool, controller, underlying, smartYieldAddr, smartYieldSign, feesOwnerAddr, rewardToken, rewardHolderAddr, crctokenWorld } = await bbFixtures(fixture());

      expect(await rewardToken.balanceOf(rewardHolderAddr), 'has no rewards').deep.equal(BN.from(0));

      await crctokenWorld.expectClaimComp(pool.address);

      // calls claimRewardsTo
      await controller.harvest(0);
      expect(await rewardToken.balanceOf(rewardHolderAddr), 'has rewards').deep.equal(e18(5));

    });

  });

  describe('setController() ', async function () {

    it('only controller or DAO can change controller', async function () {

      const { pool, controller, deployerSign, rewardHolderSign, rewardToken, rewardHolderAddr } = await bbFixtures(fixture());

      await expect(pool.connect(rewardHolderSign).setController(rewardHolderAddr), 'should throw if not dao/controller').revertedWith('CrP: only controller/DAO');

      expect(await pool.callStatic.controller(), controller.address);

      pool.connect(deployerSign).setController(rewardHolderAddr);

      expect(await pool.callStatic.controller(), rewardHolderAddr);
    });
  });

});
