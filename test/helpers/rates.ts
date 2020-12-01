import { BigNumber as BNj } from 'bignumber.js';

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
