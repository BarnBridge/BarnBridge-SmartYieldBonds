import { BigNumber as BNj } from 'bignumber.js';
import { BigNumber as BN } from 'ethers';
import { e18j, ej } from './misc';
export const DAYS_IN_YEAR = 365;

export const withCompoundRate = (principal: BNj, rate: BNj, n: number): BNj => {
  // ((((Rate / ETH Mantissa * Blocks Per Day + 1) ^ Days Per Year - 1)) - 1) * 100
  const apy = new BNj(1).plus(rate).pow(n - 1).minus(1);
  return principal.plus(principal.times(apy));
};

export const bondSlippage = (principal: BNj, forDays: number, ratePerDay: BNj, underlyingLiquidity: BNj, underlyingTotal: BNj): BNj => {
  // @TODO: REVIEW
  // x = (cur_j - (bond*x*n*t)) / (cur_tot + bond + (bond*x*n*t)) * n
  // (-b - o - b n^2 t + sqrt(4 b j n^2 t + (b + o + b n^2 t)^2))/(2 b n t)

  const t = new BNj(forDays).div(DAYS_IN_YEAR);
  const bn2t = principal.times(ratePerDay.times(ratePerDay)).times(t);

  const nume = bn2t.times(underlyingLiquidity).times(4).plus(bn2t.plus(underlyingTotal).plus(principal).pow(2)).sqrt().minus(bn2t).minus(underlyingTotal).minus(principal);
  return nume.div(principal.times(2).times(ratePerDay).times(t));
};

export const tokenPrice = (underlyingJunior: BNj, totalSupplyToken: BNj): BNj => {
  const e18 = new BNj(10).pow(18);
  return totalSupplyToken.eq(0) ? e18 : underlyingJunior.div(underlyingJunior.div(e18));
};


// compute APY based on compound formula https://compound.finance/docs#protocol-math
export const compFiApy = (ratePerBlock: number | BN): BN => {
  // const supplyApy = (((Math.pow((supplyRatePerBlock / ethMantissa * blocksPerDay) + 1, daysPerYear - 1))) - 1) * 100;
  const blocksPerDay = 4 * 60 * 24;
  const daysPerYear = 365;
  const ethMantissa = 1e18;
  let bn = new BNj(ratePerBlock.toString()).div(ethMantissa).times(blocksPerDay).plus(1);
  bn = bn.pow(daysPerYear).minus(1).times(1e18);
  return BN.from(bn.toFixed(0));
};

export const apy2supplyRateBerBlock = (apy: number): BN => {
  const r = Math.pow(1 + apy, 1/365) - 1;
  return BN.from(new BNj(r).multipliedBy(1e18).toFixed(0));
};

export const dailyRate2APYCompounding = (dailyRate: BN): string => {
  const dr = new BNj(dailyRate.toString()).div(e18j(1));
  return dr.plus(1).pow(365).minus(1).toFixed(6);
};

export const dailyRate2APYLinear = (dailyRate: BN): string => {
  const dr = new BNj(dailyRate.toString()).div(e18j(1));
  return dr.times(365).toFixed(6);
};

// e18 -> percent
export const wadToPercent = (wad: BN): string => {
  return (new BNj(wad.toString()).div(e18j(1))).toFixed(6);
};

// e27 -> percent
export const rayToPercent = (ray: BN): string => {
  return (new BNj(ray.toString()).div(ej(1, 27))).toFixed(6);
};
