import { SmartYieldPoolCompound } from '@typechain/SmartYieldPoolCompound';
import { BigNumber as BN, Signer } from 'ethers';
import { BigNumber as BNj } from 'bignumber.js';
import { toBNj } from './misc';

export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type BondType = ThenArg<ReturnType<SmartYieldPoolCompound['bonds']>>;

export const dumpBond = (msg: string, b: BondType): void => {
  const d = b.maturesAt.sub(b.issuedAt);
  console.log(msg, `{principal: ${b.principal.toString()}, gain: ${b.gain.toString()}, issuedAt: ${b.issuedAt}, maturesAt: ${b.maturesAt}, liquidated: ${b.liquidated}}, duration ${d.toString()}`);
};

export const dumpAbondState = async (msg: string, pool: SmartYieldPoolCompound): Promise<void> => {
  const abond = await pool.abond();
  const [currentTime, abondPaid, abondDebt, abondTotal] = await Promise.all([
    pool.currentTime(),
    pool.abondPaid(),
    pool.abondDebt(),
    pool.abondGain(),
  ]);

  const paidP = toBNj(abondPaid).div(toBNj(abondTotal)).times(100).toFixed(2);
  const debtP = toBNj(abondDebt).div(toBNj(abondTotal)).times(100).toFixed(2);

  console.log(msg, `[@${currentTime.toString()}] abondPaid() ${abondPaid.toString()}, abondDebt() ${abondDebt.toString()}, abondTotal() ${abondTotal.toString()}`);
  console.log(`abond, paid ${paidP}%, debt ${debtP}%`);
  dumpBond('\\', abond);
};
