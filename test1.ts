/*
// Before any operations that change the underlying amounts are made,
// (such as buyToken, sellToken, buyBond, redeemBond, etc)
// profits / losses are booked on the junior side, in 2 steps:
// 1) juniors receive all the pool yield since last time
j += underlyingPrev - underlyingNow;
// 2) juniors payout the senior guarantee incured since last time
j -= gp;
// The remaining senior guarantee is adjusted
g -= gp;



underlyingPrev = underlyingNow;
*/



const c = 1605701696;
type BOND = { start: number, end: number, reward: number, principal: number };
type STATE = {
  blocktime: number,
  total_pool_dai: number,
  total_bbcDAI_supply: number,
  junior_deposits: number,
  bbcDAI_to_DAI_ratio: number,
  queued_withdraw_dai: number,
  sBONDS: BOND[],
  ABOND: BOND
};

let state: STATE;
state.blocktime = c;

const addTime = (inc: number) => {
  state.blocktime += inc;
};

const dumpState = () => {
  console.log(`STATE@${state.blocktime}: total_pool_dai=${state.total_pool_dai}, total_bbcDAI_supply:${state.total_bbcDAI_supply}`);
  console.log(`ABOND={start:${state.ABOND.start},end:${state.ABOND.start},reward:${state.ABOND.reward},principal:${state.ABOND.principal}}`);
};

const dumpBond = (msg, id: number, b: BOND) => {
  console.log(`${msg} ID=${id}, BOND={start:${b.start},end:${b.start},reward:${b.reward},principal:${b.principal}}`);
};

const buyBond = (n: BOND) => {
  const prev: BOND = state.ABOND;
  state.total_pool_dai += n.principal;
  state.ABOND = {
    start: Math.floor(((prev.start * prev.reward) + (n.start * n.reward)) / (prev.reward + n.reward)),
    end: Math.floor(((prev.end * prev.reward) + (n.end * n.reward)) / (prev.reward + n.reward)),
    reward: prev.reward + n.reward,
    principal: prev.principal + n.principal,
  };
  const id = state.sBONDS.push(n) - 1;
  dumpBond('buyBond', id, n);
  return id;
};

const sellBond = (id: number) => {
  if (state.blocktime < state.sBONDS[id].end) {
    console.error('BOND cant be sold');
    process.exit(-1);
  }
  const prev: BOND = state.ABOND;
  const n = state.sBONDS[id];
  state.total_pool_dai -= n.principal;
  state.ABOND = {
    start: Math.floor(((prev.start * prev.reward) - (n.start * n.reward)) / (prev.reward - n.reward)),
    end: Math.floor(((prev.end * prev.reward) - (n.end * n.reward)) / (prev.reward - n.reward)),
    reward: prev.reward - n.reward,
    principal: prev.principal - n.principal,
  };
  dumpBond('buyBond', id, n);
  delete state.sBONDS[id];
};

const buyTokens = (dai: number) => {
  const total_duration = state.ABOND.end - state.ABOND.start;
  const elapsed_time = state.blocktime - state.ABOND.start;
  const total_junior_pool_dai = state.total_pool_dai - state.ABOND.principal - (state.ABOND.reward * Math.min(elapsed_time, total_duration) / total_duration);
  state.bbcDAI_to_DAI_ratio = total_junior_pool_dai / state.total_bbcDAI_supply;

  const getsTokens = dai * state.bbcDAI_to_DAI_ratio;
  state.total_bbcDAI_supply += getsTokens;
  state.total_pool_dai += dai;
  state.junior_deposits += dai;
  console.log(`buyTokens ${dai} DAI -> ${getsTokens} bbcDAI`);
};

const startWithdraw = (jtokens: number) => {
  const yield = state.total_pool_dai - state.junior_deposits - state.ABOND.principal;
  const unlocked_ratio = (state.junior_deposits + yield - state.ABOND.reward) / (state.junior_deposits  + yield);

  const total_duration = state.ABOND.end - state.ABOND.start;
  const elapsed_time = state.blocktime - state.ABOND.start;
  const total_junior_pool_dai = state.total_pool_dai - state.ABOND.principal - (state.ABOND.reward * Math.min(elapsed_time, total_duration) / total_duration);
  state.bbcDAI_to_DAI_ratio = total_junior_pool_dai / state.total_bbcDAI_supply;

  state.total_bbcDAI_supply -= unlocked_ratio * jtokens;

  // state.queued_withdraw_dai += (1 - unlocked_ratio) * Junior's deposit; // PRICE??
  state.queued_withdraw_dai += (1 - unlocked_ratio) * Junior's deposit;

};

const endWithdraw = (dai: number) => {

};


const bond1: BOND = { start: c, end: c + (60 * 60 * 24 * 1), reward: 1000, principal: 10000 };
state.ABOND = bond1;

const bond2: BOND = { start: c + 1, end: c + (60 * 60 * 24 * 30), reward: 1000, principal: 10000 };
buyBond(bond2);
