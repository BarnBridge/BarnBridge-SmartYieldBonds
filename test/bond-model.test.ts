// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import { bbFixtures, e18, MAX_UINT256, A_DAY, BLOCKS_PER_DAY, ERROR_MARGIN_PREFERED, e, compFiApy, toBN, HT, toBNj, deployClockMock, deployBondModelMock, deployUnderlying, deployCompComptroller, deployYieldOracleMock, deployCompoundController, deployCompoundProvider, deploySmartYield, deployCompCToken, deploySeniorBond, deployJuniorBond, moveTime, deploySmartYieldForModel, deployBondModel } from '@testhelp/index';

const decimals = 18;
const supplyRatePerBlock = BN.from('17887002461'); // 3.83% // 89437198474492656
const exchangeRateStored = BN.from('209925401370684257147228884');

const fixture = (decimals: number) => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const clock = await deployClockMock(deployerSign);

    const [bondModel, underlying, comptroller, oracle, controller, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployUnderlying(deployerSign, decimals),
      deployCompComptroller(deployerSign),
      deployYieldOracleMock(deployerSign),
      deployCompoundController(deployerSign),
      deployCompoundProvider(deployerSign, clock),
      deploySmartYieldForModel(deployerSign, clock),
    ]);

    const [cToken, seniorBond, juniorBond] = await Promise.all([
      deployCompCToken(deployerSign, underlying, comptroller),
      deploySeniorBond(deployerSign, smartYield),
      deployJuniorBond(deployerSign, smartYield),
    ]);

    await Promise.all([
      controller.setOracle(oracle.address),
      controller.setBondModel(bondModel.address),
      comptroller.setHolder(pool.address),
      comptroller.setMarket(cToken.address),
      pool.setup(smartYield.address, controller.address, cToken.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      (moveTime(clock))(0),
    ]);


    // const bondModel = (await deployContract(deployerSign, BondModelV1Artifact, [])) as BondModelV1;
    // const underlying = (await deployContract(deployerSign, Erc20MockArtifact, ['DAI MOCK', 'DAI', decimals])) as Erc20Mock;
    // const comptroller = (await deployContract(deployerSign, ComptrollerMockArtifact, [])) as ComptrollerMock;
    // const cToken = (await deployContract(deployerSign, CTokenMockArtifact, [underlying.address, comptroller.address])) as CTokenMock;
    // const smartYield = (await deployContract(deployerSign, SYPCompForModelMockArtifact, [])) as SypCompForModelMock;
    // const oracle = (await deployContract(deployerSign, YieldOracleMockArtifact, [smartYield.address])) as YieldOracleMock;
    // const seniorBond = (await deployContract(deployerSign, SeniorBondArtifact, ['BOND', 'BOND MOCK', smartYield.address])) as SeniorBond;
    // const juniorBond = (await deployContract(deployerSign, JuniorBondArtifact, ['jBOND', 'jBOND MOCK', smartYield.address])) as JuniorBond;
    // const juniorToken = (await deployContract(deployerSign, JuniorTokenArtifact, ['jTOKEN MOCK', 'bbDAI', smartYield.address])) as JuniorToken;
    // const controller = (await deployContract(deployerSign, ControllerCompoundArtifact, [])) as ControllerCompound;

    // await Promise.all([
    //   controller.setOracle(oracle.address),
    //   controller.setBondModel(bondModel.address),
    //   comptroller.setHolder(smartYield.address),
    //   comptroller.setMarket(cToken.address),
    //   smartYield.setup(controller.address, seniorBond.address, juniorBond.address, juniorToken.address, cToken.address),
    // ]);

    // await (moveTime(clock))(0);

    return {
      oracle, smartYield, cToken, bondModel, seniorBond, underlying, controller, pool,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
      moveTime: moveTime(clock),
    };
  };
};

describe('BondModel bond rate computations', async function () {

  it('should deploy contracts correctly', async function () {
    const decimals = 18;
    const { smartYield, pool, oracle, bondModel, cToken, underlying, seniorBond, controller } = await bbFixtures(fixture(decimals));

    expect(await smartYield.controller()).equals(controller.address, 'smartYield.controller()');
    expect(await pool.uToken()).equals(underlying.address, 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
  });

  describe('bondModel.gain()', async function () {
    it('expected values', async function () {
      const { smartYield, oracle, bondModel, cToken, underlying, moveTime, junior1, senior1, senior2 } = await bbFixtures(fixture(decimals));

      let underlyingLoanable = e18(1000);
      expect(underlyingLoanable.gte(0), 'no liquidity (1)');
      let underlyingTotal = e18(1000);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      let principal = e18(100);
      let gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (1)').deep.equal(BN.from('3465336790874529321'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (2)');
      underlyingTotal = underlyingTotal.add(principal);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(400);
      gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (2)').deep.equal(BN.from('10014927776178109680'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (3)');
      underlyingTotal = underlyingTotal.add(principal);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(1000);
      gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (3)').deep.equal(BN.from('14721619513810555552'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (4)');
      underlyingTotal = underlyingTotal.add(principal);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(100000000);
      gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (4)').deep.equal(BN.from('35169944167142674007'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (5)');
      underlyingTotal = underlyingTotal.add(principal);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(9000);
      gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (5)').deep.equal(BN.from('3169649973341740'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);

      underlyingLoanable = underlyingLoanable.sub(gain);
      expect(underlyingLoanable.gte(0), 'no liquidity (6)');
      underlyingTotal = underlyingTotal.add(principal);
      await smartYield.setMockValues(underlyingLoanable, underlyingTotal, supplyRatePerBlock.mul(BLOCKS_PER_DAY));
      principal = e18(1);
      gain = await bondModel.gain(smartYield.address, principal, 365);
      expect(gain, 'gain should be correct (6)').deep.equal(BN.from('352183326719'));
      console.log(`gain : ${gain}, ${toBNj(gain).div(toBNj(principal)).times(100).toFixed(2)}%`);
    });

  });


});
