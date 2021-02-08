// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, deployClockMock, deployBondModel, deployUnderlying, deployCompComptroller, deployCompoundController, deployCompoundProvider, deploySmartYield, deployYieldOracle, deploySeniorBond, deployCompCTokenYielding, deployJuniorBond, moveTime, buyTokens, sellTokens, buyBond, redeemBond } from '@testhelp/index';

// import BondModelArtifact from './../artifacts/contracts/model/BondModelV1.sol/BondModelV1.json';
// import { BondModelV1 } from '@typechain/BondModelV1';

// import Erc20MockArtifact from './../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';
// import { Erc20Mock } from '@typechain/Erc20Mock';

// import ComptrollerMockArtifact from './../artifacts/contracts/mocks/compound-finance/ComptrollerMock.sol/ComptrollerMock.json';
// import { ComptrollerMock } from '@typechain/ComptrollerMock';

// import CTokenMockArtifact from './../artifacts/contracts/mocks/compound-finance/CTokenYieldingMock.sol/CTokenYieldingMock.json';
// import { CTokenYieldingMock } from '@typechain/CTokenYieldingMock';

// import SmartYieldMockArtifact from './../artifacts/contracts/mocks/barnbridge/SmartYieldMock.sol/SmartYieldMock.json';
// import { SmartYieldMock } from '@typechain/SmartYieldMock';

// import CompoundControllerArtifact from './../artifacts/contracts/providers/CompoundController.sol/CompoundController.json';
// import { CompoundController } from '@typechain/CompoundController';

// import YieldOracleArtifact from './../artifacts/contracts/oracle/YieldOracle.sol/YieldOracle.json';
// import { YieldOracle } from '@typechain/YieldOracle';

// import JuniorBondArtifact from './../artifacts/contracts/JuniorBond.sol/JuniorBond.json';
// import { JuniorBond } from '@typechain/JuniorBond';

// import SeniorBondArtifact from './../artifacts/contracts/SeniorBond.sol/SeniorBond.json';
// import { SeniorBond } from '@typechain/SeniorBond';

const decimals = 18;
const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const clock = await deployClockMock(deployerSign);

    const [bondModel, underlying, comptroller, controller, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployUnderlying(deployerSign, decimals),
      deployCompComptroller(deployerSign),
      deployCompoundController(deployerSign),
      deployCompoundProvider(deployerSign, clock),
      deploySmartYield(deployerSign, clock),
    ]);

    const [oracle, cToken, seniorBond, juniorBond] = await Promise.all([
      deployYieldOracle(deployerSign, pool, 4 * A_DAY, 4),
      deployCompCTokenYielding(deployerSign, underlying, comptroller, clock, exchangeRateStored),
      deploySeniorBond(deployerSign, smartYield),
      deployJuniorBond(deployerSign, smartYield),
    ]);

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setBondModel(bondModel.address),
      comptroller.setHolder(smartYield.address),
      comptroller.setMarket(cToken.address),
      pool.setup(smartYield.address, controller.address, cToken.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY)),
      controller.setFeeBuyJuniorToken(e18(0).div(100)),
      (moveTime(clock))(0),
    ]);

    // const [bondModel, underlying, comptroller, pool, controller] = await Promise.all([
    //   (deployContract(deployerSign, BondModelArtifact, [])) as Promise<BondModelV1>,
    //   (deployContract(deployerSign, Erc20MockArtifact, ['DAI mock', 'DAI', decimals])) as Promise<Erc20Mock>,
    //   (deployContract(deployerSign, ComptrollerMockArtifact, [])) as Promise<ComptrollerMock>,
    //   (deployContract(deployerSign, SmartYieldMockArtifact, [])) as Promise<SmartYieldMock>,
    //   (deployContract(deployerSign, CompoundControllerArtifact, [])) as Promise<CompoundController>,
    // ]);

    // const [cToken, oracle, seniorBond, juniorBond, juniorToken] = await Promise.all([
    //   (deployContract(deployerSign, CTokenMockArtifact, [underlying.address, comptroller.address, pool.address, exchangeRateStored])) as Promise<CTokenYieldingMock>,
    //   (deployContract(deployerSign, YieldOracleArtifact, [pool.address, 4 * A_DAY, 4])) as Promise<YieldOracle>,
    //   (deployContract(deployerSign, SeniorBondArtifact, ['sBOND mock', 'sBOND mock', pool.address])) as Promise<SeniorBond>,
    //   (deployContract(deployerSign, JuniorBondArtifact, ['jBOND mock', 'jBOND mock', pool.address])) as Promise<JuniorBond>,
    //   (deployContract(deployerSign, JuniorTokenArtifact, ['bbDAI mock', 'bbDAI', pool.address])) as Promise<JuniorToken>,
    // ]);

    // await Promise.all([
    //   controller.setOracle(oracle.address),
    //   controller.setBondModel(bondModel.address),
    //   comptroller.setHolder(pool.address),
    //   comptroller.setMarket(cToken.address),
    //   pool.setup(controller.address, seniorBond.address, juniorBond.address, juniorToken.address, cToken.address),
    //   cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY)),
    //   controller.setFeeBuyJuniorToken(e18(0).div(100)),
    // ]);

    // await (moveTime(pool))(0);

    return {
      oracle, pool, smartYield, cToken, bondModel, seniorBond, juniorBond, underlying, controller,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      buyTokens: buyTokens(smartYield, pool, underlying),
      sellTokens: sellTokens(smartYield, pool),
      buyBond: buyBond(smartYield, pool, underlying),
      redeemBond: redeemBond(smartYield),
      moveTime: moveTime(clock),
    };
  };
};

describe('tokens: buyTokens()', async function () {
  it('should deploy contracts correctly', async function () {
    const { smartYield, pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond } = await bbFixtures(fixture(decimals));

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await smartYield.juniorBond()).equals(juniorBond.address, 'smartYield.juniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    expect(await oracle.pool()).equals(pool.address, 'oracle.pool()');
  });

  describe('instant withdraw', async function () {
    it('if there\'s debt, it is forfeit', async function () {
      const { smartYield, pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, sellTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      const tokensBefore = await smartYield.balanceOf(junior1.address);

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 20);

      const underlyingBefore = (await smartYield.price()).mul(tokensBefore).div(e18(1));
      const underlyingDebt = (await smartYield.abondDebt());
      await sellTokens(junior1, tokensBefore);
      const underlyingGot = (await underlying.balanceOf(junior1.address));

      expect(underlyingBefore.sub(underlyingGot), 'user got too much').deep.equal(underlyingDebt);
      expect(await smartYield.price(), 'price should be 1 (1)').deep.equal(e18(1));
      await moveTime(A_DAY * 20);

      expect(await smartYield.price(), 'price should be 1 (2)').deep.equal(e18(1));
      expect(await smartYield.abondDebt(), 'debt should be 0').deep.equal(e18(0));
    });

    it('if there\'s debt, it is forfeit with multiple juniors', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, sellTokens, buyBond, junior1, junior2, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));
      const tokensBefore1 = await smartYield.balanceOf(junior1.address);

      await buyTokens(junior2, e18(900));
      const tokensBefore2 = await smartYield.balanceOf(junior2.address);

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      await buyBond(senior1, e18(1000), 0, 30);
      await moveTime(A_DAY * 20);

      const underlyingBefore1 = (await smartYield.price()).mul(tokensBefore1).div(e18(1));
      const underlyingDebt = (await smartYield.abondDebt());
      await sellTokens(junior1, tokensBefore1);
      const underlyingGot1 = (await underlying.balanceOf(junior1.address));

      console.log('diff >', underlyingBefore1.sub(underlyingGot1).toString());
      console.log('debt >', underlyingDebt.mul(100).div(1000).toString());

      expect(underlyingBefore1.sub(underlyingGot1), 'user got too much').deep.equal(underlyingDebt.mul(100).div(1000));
    });
  });

  describe('buyTokens', async function () {
    it('junior gets tokens', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const tokensBefore = await smartYield.balanceOf(junior1.address);
      await buyTokens(junior1, e18(100));
      const tokensAfter = await smartYield.balanceOf(junior1.address);
      expect(tokensBefore, 'balance before should be 0').equal(0);
      expect(tokensAfter, 'balance after should be 100').deep.equal(e18(100));
    });
  });

  describe('price', async function () {

    it('yield decreases after buyBond, price goes down', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const priceBefore = await smartYield.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await buyBond(senior1, e18(1000), 0, 30);

      await cToken.setYieldPerDay(0);

      await moveTime(A_DAY * 10);

      const priceNow = await smartYield.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      expect(priceNow.lt(priceBefore), 'price now not lower (1)').equal(true);

      await moveTime(A_DAY * 20);

      const priceNow2 = await smartYield.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      console.log('priceNow2', priceNow2.toString());
      expect(priceNow2.lt(priceNow), 'price now not even lower (2)').equal(true);
    });

    it('yield increases after buyBond, price goes up', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      const priceBefore = await smartYield.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }

      console.log('Bond Gain', (await bondModel.gain(smartYield.address, e18(1000), 30)).toString());
      await buyBond(senior1, e18(1000), 0, 30);

      await cToken.setYieldPerDay(supplyRatePerBlock.mul(BLOCKS_PER_DAY).mul(2));

      await moveTime(A_DAY * 10);

      const priceNow = await smartYield.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      expect(priceNow.gt(priceBefore), 'price now not greater (1)').equal(true);

      await moveTime(A_DAY * 20);

      const priceNow2 = await smartYield.price();
      console.log('priceBefore', priceBefore.toString());
      console.log('priceNow', priceNow.toString());
      console.log('priceNow2', priceNow2.toString());
      expect(priceNow2.gt(priceNow), 'price now not even greater (2)').equal(true);
    });

    it('price doesn\'t change before and after buyTokens', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);

      const priceBefore = await smartYield.price();
      await buyTokens(junior1, e18(1000));
      expect(await smartYield.price(), 'price changed').deep.equal(priceBefore);
    });

    it('price doesn\'t change before and after buyBond', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);

      const priceBefore = await smartYield.price();
      await buyBond(senior1, e18(1000), 0, 30);
      expect(await smartYield.price(), 'price changed').deep.equal(priceBefore);
    });

    it('with no yield price stays the same', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond, moveTime, buyTokens, buyBond, junior1, senior1 } = await bbFixtures(fixture(decimals));
      await cToken.setYieldPerDay(0);

      const priceBefore = await smartYield.price();
      await buyTokens(junior1, e18(100));

      for (let i = 0; i < 3; i++) {
        await moveTime(A_DAY);
        //await cToken.doYield();
        await oracle.update();
        console.log(i, 'oracle (vs realish)', (await oracle.consult(A_DAY)).toString(), '(', supplyRatePerBlock.mul(BLOCKS_PER_DAY).toString(), ')');
      }
      await moveTime(A_DAY);
      expect(await smartYield.price(), 'price changed (1)').deep.equal(priceBefore.sub(1));
      await buyTokens(junior1, e18(1000));
      expect(await smartYield.price(), 'price changed (2)').deep.equal(priceBefore.sub(1));
    });


  });

});
