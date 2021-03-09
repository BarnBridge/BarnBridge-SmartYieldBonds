// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';

import {
  bbFixtures,
  e18,
  A_DAY,
  BLOCKS_PER_DAY,
  deployBondModel,
  deployUnderlying,
  deployCompoundController,
  deploySmartYieldMock,
  deployYieldOracle,
  deploySeniorBondMock,
  deployJuniorBondMock,
  buyTokens,
  sellTokens,
  buyBond,
  redeemBond,
  currentTime, toBN, deployHarvestMockWorld, deployCompoundProvider, deploySmartYield, deploySeniorBond, deployJuniorBond, TIME_IN_FUTURE, A_HOUR
} from '@testhelp/index';
import { Erc20MockFactory } from '@typechain/Erc20MockFactory';
import { UniswapMockFactory } from '@typechain/UniswapMockFactory';
import { CompOracleMockFactory } from '@typechain/CompOracleMockFactory';
import { ERC20Factory } from '@typechain/Erc20Factory';
import { ICTokenFactory } from '@typechain/IcTokenFactory';
import { IComptrollerFactory } from '@typechain/IComptrollerFactory';

const supplyRatePerBlock = BN.from('40749278849'); // 8.94% // 89437198474492656
const exchangeRateStored = BN.from('209682627301038234646967647');

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


const fixture = () => {
  return async (wallets: Wallet[]) => {
    const [deployerSign, ownerSign, junior1, junior2, junior3, senior1, senior2, senior3] = wallets;

    const underlying = ERC20Factory.connect(USDC, deployerSign);
    const cToken = ICTokenFactory.connect(cUSDC, deployerSign);
    const comp = ERC20Factory.connect(COMP, deployerSign);
    const compoundComptroller = IComptrollerFactory.connect(cComptroller, deployerSign);

    const [bondModel, pool, smartYield] = await Promise.all([
      deployBondModel(deployerSign),
      deployCompoundProvider(deployerSign, cUSDC),
      deploySmartYield(deployerSign, juniorTokenCONF.name, juniorTokenCONF.symbol, BN.from(decimals)),
    ]);

    const [controller, seniorBond, juniorBond] = await Promise.all([
      deployCompoundController(deployerSign, pool.address, smartYield.address, bondModel.address, uniswapPath),
      deploySeniorBond(deployerSign, smartYield.address, seniorBondCONF.name, seniorBondCONF.symbol),
      deployJuniorBond(deployerSign, smartYield.address, juniorBondCONF.name, juniorBondCONF.symbol),
    ]);

    const [oracle ] = await Promise.all([
      deployYieldOracle(deployerSign, controller.address, oracleCONF.windowSize, oracleCONF.granularity),
      controller.setBondModel(bondModel.address),
      controller.setFeesOwner(deployerSign.address),
      smartYield.setup(controller.address, pool.address, seniorBond.address, juniorBond.address),
      pool.setup(smartYield.address, controller.address),
    ]);

    await controller.setOracle(oracle.address);


    return {
      oracle, smartYield, cToken, bondModel, seniorBond, juniorBond, underlying, controller, pool, compoundComptroller, comp,
      deployerSign: deployerSign as Signer,
      ownerSign: ownerSign as Signer,
      junior1, junior2, junior3, senior1, senior2, senior3,
    };
  };
};

describe('Controller', async function () {
  it('should deploy contracts correctly', async function () {
    const { smartYield, pool, oracle, bondModel, cToken, underlying, controller, seniorBond, juniorBond } = await bbFixtures(fixture());

    expect(await pool.controller()).equals(controller.address, 'pool.controller()');
    expect((await pool.uToken()).toLowerCase()).equals(underlying.address.toLowerCase(), 'pool.uToken()');
    expect(await pool.cToken()).equals(cToken.address, 'pool.cToken()');
    expect(await smartYield.seniorBond()).equals(seniorBond.address, 'smartYield.seniorBond()');
    expect(await smartYield.juniorBond()).equals(juniorBond.address, 'smartYield.juniorBond()');
    expect(await controller.oracle()).equals(oracle.address, 'controller.oracle()');
    expect(await controller.bondModel()).equals(bondModel.address, 'controller.bondModel()');
    expect(await oracle.cumulator()).equals(controller.address, 'oracle.cumulator()');
  });


  describe('testing Icontroller and Governed', async function () {
    it('Icontroller', async function () {
      const { controller, senior1, smartYield } = await bbFixtures(fixture());
      await expect(controller.connect(senior1).setBondMaxRatePerDay(e18(10))).to.be.revertedWith('GOV: not dao/guardian');
      await expect(controller.connect(senior1).setPaused(false, true)).to.be.revertedWith('GOV: not dao/guardian');
      await controller.setPaused(true, true);
      await expect(smartYield.buyTokens(toBN(10), 1, TIME_IN_FUTURE)).to.be.revertedWith('SY: buyTokens paused');
      await controller.setBondMaxRatePerDay(toBN(10));
      expect (await controller['BOND_MAX_RATE_PER_DAY()']()).to.be.equal(toBN(10));
    });

    it('Governed', async function () {
      const { controller, senior1, deployerSign } = await bbFixtures(fixture());
      const deployerSignAddr = await deployerSign.getAddress();
      expect(await controller.dao()).to.be.equal(deployerSignAddr);
      expect(await controller.guardian()).to.be.equal(deployerSignAddr);
      await expect(controller.connect(senior1).setDao(senior1.address)).to.be.revertedWith('GOV: not dao');
      await expect(controller.connect(senior1).setGuardian(senior1.address)).to.be.revertedWith('GOV: not dao');

      await controller.setGuardian(senior1.address);
      await controller.setDao(senior1.address);

      expect(await controller.dao()).to.be.equal(senior1.address);
      expect(await controller.guardian()).to.be.equal(senior1.address);

    });
  });


});
