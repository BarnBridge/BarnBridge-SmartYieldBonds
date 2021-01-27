import { SmartYieldPoolCompound } from '@typechain/SmartYieldPoolCompound';
import { BigNumber as BN, Signer } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { e18, toBNj } from './misc';
import { HD, HT } from '.';

export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type BondType = ThenArg<ReturnType<SmartYieldPoolCompound['bonds']>>;

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

export const dumpAbondState = async (msg: string, pool: SmartYieldPoolCompound): Promise<void> => {
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
