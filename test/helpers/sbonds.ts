import { CompoundProvider } from '@typechain/CompoundProvider';
import { SmartYield } from '@typechain/SmartYield';

import { BigNumber as BN, Overrides, Signer, Wallet } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { e18, toBN, toBNj } from './misc';
import { HD, HT } from '.';
import { Erc20Mock } from '@typechain/Erc20Mock';
import { TIME_IN_FUTURE } from './time';

export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type BondType = ThenArg<ReturnType<SmartYield['seniorBonds']>>;

export const buyBond = (smartYield: SmartYield, pool: CompoundProvider, underlying: Erc20Mock) => {
  return async (user: Wallet, amountUnderlying: number | BN, minGain: number | BN, forDays: number | BN): Promise<void> => {
    amountUnderlying = toBN(amountUnderlying);
    forDays = toBN(forDays);
    minGain = toBN(minGain);
    await underlying.mintMock(user.address, amountUnderlying);
    await underlying.connect(user).approve(pool.address, amountUnderlying);
    await smartYield.connect(user).buyBond(amountUnderlying, minGain, TIME_IN_FUTURE, forDays, {gasLimit: 2_000_000});
  };
};

export const redeemBond = (smartYield: SmartYield) => {
  return async (user: Wallet, id: number | BN): Promise<void> => {
    id = toBN(id);
    await smartYield.connect(user).redeemBond(id, { gasLimit: 2_000_000 });
  };
};

export const dumpBond = (msg: string, b: BondType, now: BN | number | undefined = undefined, isAbond = false, tabs = ''): void => {
  if (isAbond) {
    b = {
      ...b,
      maturesAt: b.maturesAt.div(e18(1)),
      issuedAt: b.issuedAt.div(e18(1)),
    };
  }

  const d = b.maturesAt.sub(b.issuedAt);

  if (now) {
    const left = b.maturesAt.sub(BN.from(now));
    const txt = left.gte(0) ? 'left:' : 'PAST by: -';
    console.log(tabs, msg);
    console.log(tabs, `| [duration: ${HD(d)}][${txt} ${HD(left)}]`);
    console.log(tabs, `\\ {principal: ${b.principal.toString()}, gain: ${b.gain.toString()}, issuedAt: ${HT(b.issuedAt)}, maturesAt: ${HT(b.maturesAt)}, liquidated: ${b.liquidated}}`);
  } else {
    console.log(tabs, msg);
    console.log(tabs, `| [duration: ${HD(d)}]`);
    console.log(tabs, `\\ {principal: ${b.principal.toString()}, gain: ${b.gain.toString()}, issuedAt: ${HT(b.issuedAt)}, maturesAt: ${HT(b.maturesAt)}, liquidated: ${b.liquidated}}, [duration: ${HD(d)}]`);
  }
};

export const dumpAbondState = async (msg: string, pool: SmartYield): Promise<void> => {
  const abond = await pool.abond();
  const [currentTime, abondPaid, abondDebt, abondTotal, bondsOutstanding] = await Promise.all([
    pool.currentTime(),
    pool.abondPaid(),
    pool.abondDebt(),
    pool.abondGain(),
    pool.bondsOutstanding(),
  ]);

  const paidP = toBNj(abondPaid).div(toBNj(abondTotal)).times(100).toFixed(2);
  const debtP = toBNj(abondDebt).div(toBNj(abondTotal)).times(100).toFixed(2);

  console.log(`${msg} \t[now: ${HT(currentTime)}, bonds=${bondsOutstanding}] ---------------------------------------- `);
  console.log(`\tabondPaid() ${abondPaid.toString()}, abondDebt() ${abondDebt.toString()}, abondTotal() ${abondTotal.toString()} / paid ${paidP}%, debt ${debtP}%`);
  dumpBond('ABOND:', abond, currentTime, true, '\t');
  console.log(`\t----------------------------------------------------------------------------------`);

};

export const dumpSeniorBond = (sBond: BondType) => {
  console.log('gain      :', sBond.gain.toString());
  console.log('principal :', sBond.principal.toString());
  console.log('issuedAt  :', sBond.issuedAt.toString());
  console.log('maturesAt :', sBond.maturesAt.toString());
};
