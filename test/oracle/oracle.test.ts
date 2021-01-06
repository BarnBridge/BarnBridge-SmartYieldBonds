// needs to be added to each test so path aliases work
import 'tsconfig-paths/register';

import { expect } from 'chai';
import { Signer, Wallet, BigNumber as BN } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { deployContract } from 'ethereum-waffle';

describe('sBond & jToken Prices', async function () {
  it('Junior Token Price should be 1 at begining', async function () {
    const { pool } = await bbFixtures(fixture);

    expect(await pool.getsTokens(42424)).deep.equals(BN.from(42424), 'Token price should be 1');
    expect(await pool.getsUnderlying(42424)).deep.equals(BN.from(42424), 'Token price should be 1');
  });

  it('should allow juniors to buy tokens', async function () {
    const { ctoken, underliying, pool, juniorToken, junior1Addr, junior2Addr, junior1Sign, junior2Sign } = await bbFixtures(fixture);

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

});
