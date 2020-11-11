import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

import { SmartYieldPoolMock } from '../typechain/SmartYieldPoolMock';
import { SeniorBondToken } from '../typechain/SeniorBondToken';
import { TokenPriceV1 } from '../typechain/TokenPriceV1';
import { SeniorBondSlippageExpV1 } from '../typechain/SeniorBondSlippageExpV1';

import { CTokenMock } from '../typechain/CTokenMock';
import { Erc20Mock } from '../typechain/Erc20Mock';

import SmartYieldPoolMockArtefact from '../artifacts/contracts/mocks/BarnBridge/SmartYieldPoolMock.sol/SmartYieldPoolMock.json';
import SeniorBondTokenArtefact from '../artifacts/contracts/SeniorBondToken.sol/SeniorBondToken.json';
import TokenPriceV1Artefact from '../artifacts/contracts/Model/Token/TokenPriceV1.sol/TokenPriceV1.json';
import SeniorBondSlippageV1Artefact from '../artifacts/contracts/Model/Bond/SeniorBondSlippageExpV1.sol/SeniorBondSlippageExpV1.json';

import CTokenMockArtefact from '../artifacts/contracts/mocks/CTokenMock.sol/CTokenMock.json';
import Erc20MockArtefact from '../artifacts/contracts/mocks/Erc20Mock.sol/Erc20Mock.json';

import { withCompoundRate, toWei, bondSlippage, toBNj, e18, ERROR_MARGIN_ACCEPTABLE } from './helpers';

describe('2sBond & jToken Prices', function () {

  let deployerSign: Signer, ownerSign: Signer, junior1Sign: Signer, junior2Sign: Signer, senior1Sign: Signer, senior2Sign: Signer;
  let deployerAddr: string, ownerAddr: string, junior1Addr: string, junior2Addr: string, senior1Addr: string, senior2Addr: string;

  let juniorModel: TokenPriceV1;
  let seniorModel: SeniorBondSlippageExpV1;

  let ctoken: CTokenMock, rewardCtoken: Erc20Mock, juniorToken: Erc20Mock, seniorToken: SeniorBondToken, underliying: Erc20Mock;
  let pool: SmartYieldPoolMock;
  let snapshotId: any;


  beforeEach(async function () {
    snapshotId = await ethers.provider.send('evm_snapshot', []);

    [deployerSign, ownerSign, junior1Sign, junior2Sign, senior1Sign, senior2Sign] = await ethers.getSigners();
    [deployerAddr, ownerAddr, junior1Addr, junior2Addr, senior1Addr, senior2Addr] = await Promise.all([
      deployerSign.getAddress(),
      ownerSign.getAddress(),
      junior1Sign.getAddress(),
      junior2Sign.getAddress(),
      senior1Sign.getAddress(),
      senior2Sign.getAddress(),
    ]);

    afterEach(async function () {
      await ethers.provider.send('evm_revert', [snapshotId]);
    });

    rewardCtoken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['COMP', 'COMP'])) as Erc20Mock;
    underliying = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['DAI', 'DAI'])) as Erc20Mock;
    ctoken = (await deployContract(<Wallet>deployerSign, CTokenMockArtefact, [underliying.address])) as CTokenMock;

    juniorModel = (await deployContract(deployerSign, TokenPriceV1Artefact, [])) as TokenPriceV1;
    seniorModel = (await deployContract(deployerSign, SeniorBondSlippageV1Artefact, [])) as SeniorBondSlippageExpV1;

    pool = (await deployContract(<Wallet>deployerSign, SmartYieldPoolMockArtefact, [ctoken.address])) as SmartYieldPoolMock;

    juniorToken = (await deployContract(<Wallet>deployerSign, Erc20MockArtefact, ['jBOND', 'jBOND'])) as Erc20Mock;
    seniorToken = (await deployContract(<Wallet>deployerSign, SeniorBondTokenArtefact, ['sBOND', 'sBOND', pool.address])) as SeniorBondToken;

    await pool.setCToken(ctoken.address);
    await pool.setRewardCToken(rewardCtoken.address);
    await pool.setUnderlying(underliying.address);

    await pool.setJuniorModel(juniorModel.address);
    await pool.setSeniorModel(seniorModel.address);

    await pool.setJuniorToken(juniorToken.address);
    await pool.setSeniorToken(seniorToken.address);


  });

  it('2Junior Token Price should be 1 at begining', async function () {
    expect(await pool.getsTokens(42424)).deep.equals(BN.from(42424), 'Token price should be 1');
    expect(await pool.getsUnderlying(42424)).deep.equals(BN.from(42424), 'Token price should be 1');
  });

  it('2should allow juniors to buy tokens', async function () {

    await ctoken.setSupplyRatePerBlock(BN.from('14135523863'));
    await ctoken.setExchangeRateStored(BN.from('207578806244699024287878498'));

    await underliying.mintMock(junior1Addr, BN.from(1000));
    await underliying.connect(junior1Sign).approve(pool.address, BN.from(1000));

    await underliying.mintMock(junior2Addr, BN.from(1900));
    await underliying.connect(junior2Sign).approve(pool.address, BN.from(1900));

    await pool.connect(junior1Sign).buyToken(BN.from(1000));

    await pool.connect(junior2Sign).buyToken(BN.from(1900));

    expect(await juniorToken.balanceOf(junior1Addr)).deep.equals(BN.from(1000), 'Should have received 1000 jToken');
    expect(await juniorToken.balanceOf(junior2Addr)).deep.equals(BN.from(1900), 'Should have received 1900 jToken');

    expect(await pool.getsTokens(1)).deep.equals(BN.from(1), 'Token price should still be 1');
  });

  it('2should allow seniors to buy tokens', async function () {

    const supplyRatePerBlock = BN.from('14135523863');
    const exchangeRateStored = BN.from('207578806244699024287878498');
    const BLOCKS_PER_DAY = await pool.BLOCKS_PER_DAY();
    const ratePerDay = BLOCKS_PER_DAY.mul(supplyRatePerBlock);

    await ctoken.setSupplyRatePerBlock(supplyRatePerBlock);
    await ctoken.setExchangeRateStored(exchangeRateStored);

    await underliying.mintMock(junior1Addr, e18(1000));
    await underliying.connect(junior1Sign).approve(pool.address, e18(1000));

    await pool.connect(junior1Sign).buyToken(e18(1000));

    expect(await juniorToken.balanceOf(junior1Addr)).deep.equals(e18(1000), 'Should have received 1000 jToken');

    await underliying.mintMock(senior1Addr, e18(1000));
    await underliying.connect(senior1Sign).approve(pool.address, e18(1000));

    const underlyingLiquidity = await pool.underlyingLiquidity();
    const underlyingTotal = await pool.underlyingTotal();

    await pool.connect(senior1Sign).buyBond(e18(1000), BN.from(365));

    const bond = await pool.getBond(0);
    const ideal = await pool.bondGain(toWei(1000), ratePerDay, BN.from(365));

    const comparisonRate = bondSlippage(new BNj(1000), 365, toBNj(ratePerDay).div(toBNj(e18(1))), toBNj(underlyingLiquidity).div(toBNj(e18(1))), toBNj(underlyingTotal).div(toBNj(e18(1))));
    const comparisonGain = withCompoundRate(toBNj(1000), comparisonRate, 356).times(toBNj(e18(1)));

    expect(bond[1]).equalWithin(comparisonGain, ERROR_MARGIN_ACCEPTABLE);
  });


});
