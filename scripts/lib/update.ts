import axios from 'axios';
import { Wallet, BigNumber as BN, Signer } from 'ethers';
import { ethers, web3 } from 'hardhat';
import { Block } from '@ethersproject/abstract-provider';
import { YieldOracleFactory } from '@typechain/YieldOracleFactory';
import { YieldOracle } from '@typechain/YieldOracle';
import { SmartYieldFactory } from '@typechain/SmartYieldFactory';
import { CompoundControllerFactory } from '@typechain/CompoundControllerFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundController } from '@typechain/CompoundController';

export type PoolName = string;
export type SmartYields = { [key in PoolName]: string };
export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type Observation = ThenArg<ReturnType<YieldOracle['yieldObservations']>>;

type OraclesConnection = {
  [prop in PoolName]: {
    smartYieldAddr: string,
    oracle: YieldOracle,
    smartYield: SmartYield,
    controller: CompoundController,
  }
};

type OraclesInfo = {
  [prop in PoolName]: {
    windowSize: BN,
    granularity: number,
    periodSize: BN,
    observations: Observation[],
    latestObservation: Observation,
    block: Block
  }
};


type OracleData = {
  id: string,
  smartYieldAddr: string,
  oracleAddr: string,

  windowSize: BN,
  granularity: number,
  periodSize: BN,
  observations: Observation[],

  oracle: YieldOracle,
  smartYield: SmartYield,
  controller: CompoundController,

  lastUpdatePeriodStart: BN,
}

export class UpdaterFast {

  public oracles: OracleData[] = [];

  public signer: Wallet;
  public periodWaitPercent: number;
  public maxSleepSec: number;
  public gasPriceGetter: () => Promise<BN>;

  constructor(signer: Wallet, periodWaitPercent: number, maxSleepSec: number, gasPriceGetter: () => Promise<BN>) {
    this.signer = signer;
    this.periodWaitPercent = periodWaitPercent;
    this.maxSleepSec = maxSleepSec;
    this.gasPriceGetter = gasPriceGetter;
  }

  public async initialize(sy: SmartYields): Promise<void> {

    for (const key in sy) {
      const connections = (await connect(sy[key], this.signer));
      const properties = (await getOracleInfo(connections.oracle));
      const oracle: OracleData = {
        id: key,
        lastUpdatePeriodStart: BN.from(0),
        smartYieldAddr: sy[key],
        oracleAddr: connections.oracle.address,
        ...connections,
        ...properties,
      };

      this.oracles.push(oracle);
    }
  }

  public async getSleepSec(blockTimestamp: BN): Promise<number> {
    return this.oracles.reduce((sleepSec: number, oracle: OracleData): number => {
      const sleepNeeded = this.canWait(blockTimestamp, oracle);
      return Math.min(sleepNeeded, sleepSec);
    }, this.maxSleepSec);
  }

  private canWait(blockTimestamp: BN, oracle: OracleData): number {
    const periodStart = blockTimestamp.div(oracle.periodSize).mul(oracle.periodSize);
    if (oracle.lastUpdatePeriodStart.eq(periodStart)) {
      return oracle.periodSize.toNumber();
    }
    const periodElapsed = blockTimestamp.sub(periodStart);
    const periodWait = oracle.periodSize.mul(BN.from(Math.floor(this.periodWaitPercent * 100000))).div(100000);

    const sleepNeeded = periodWait.sub(periodElapsed).toNumber();

    if (0 >= sleepNeeded) {
      return 0;
    }

    return sleepNeeded;
  }

  private canUpdate(): number {

  }

  public async getOraclesInUpdateWindow(blockTimestamp: BN): Promise<OracleData[]> {
    const oraclesInUpdateWindow = [];
    for (let i = 0; i < this.oracles.length; i++ ) {
      const sleepNeeded = this.canWait(blockTimestamp, this.oracles[i]);
      if (sleepNeeded > 0) {
        continue;
      }

    }
  }

}


export class Updater {
  public maxSleepSec = 10000;
  public signer: Wallet;
  public smartYields: SmartYields;
  public oraclesInfo: OraclesInfo;
  public oraclesConnection: OraclesConnection;
  public gasPriceGetter: () => Promise<BN>;

  constructor(sy: SmartYields, signer: Wallet, maxSleepSec: number, gasPriceGetter: () => Promise<BN>) {
    this.smartYields = sy;
    this.signer = signer;
    this.maxSleepSec = maxSleepSec;
    this.oraclesConnection = {} as OraclesConnection;
    this.oraclesInfo = {} as OraclesInfo;
    this.gasPriceGetter = gasPriceGetter;
  }

  public async connect(): Promise<void> {
    for (const pool in this.smartYields) {
      console.log(`Connecting "${pool}" (${this.smartYields[pool as PoolName]})  ...`);
      this.oraclesConnection[pool as PoolName] = {
        smartYieldAddr: this.smartYields[pool as PoolName],
        ...(await connect(this.smartYields[pool as PoolName], this.signer)),
      };
    }
  }

  public async getOraclesInfo(): Promise<void> {
    console.log('\nORACLE INFOS:');
    for (const pool in this.smartYields) {
      console.log(`"${pool}" (${this.smartYields[pool as PoolName]}) ...`);
      this.oraclesInfo[pool as PoolName] = {
        ...(await getOracleInfo(this.oraclesConnection[pool as PoolName].oracle)),
      };
    }
  }

  public async getSleepSec(): Promise<{ [prop in PoolName]: number }> {
    const ret = {} as { [prop in PoolName]: number };
    console.log('\nSLEEP TIMES:');
    for (const pool in this.smartYields) {
      ret[pool as PoolName] = shouldSleep(
        this.oraclesInfo[pool as PoolName].latestObservation,
        this.oraclesInfo[pool as PoolName].periodSize,
        this.oraclesInfo[pool as PoolName].block.timestamp,
        1
      );
      console.log(`"${pool}" (${this.smartYields[pool as PoolName]}): ${ret[pool as PoolName]} sec.  ...`);
    }
    return ret;
  }

  public needsUpdate(sleeps: { [prop in PoolName]: number }): boolean {
    for (const pool in sleeps) {
      if (0 === sleeps[pool as PoolName]) {
        return true;
      }
    }
    return false;
  }

  public async sleep(sleeps: { [prop in PoolName]: number }): Promise<void> {
    let sleepSec: number = this.maxSleepSec;
    for (const pool in sleeps) {
      if (sleeps[pool as PoolName] < sleepSec) {
        sleepSec = sleeps[pool as PoolName];
      }
    }
    console.log(`\nSLEEP: sleeping ${sleepSec} sec. ...`);
    await sleep(sleepSec * 1000);
  }

  public async doUpdates(sleeps: { [prop in PoolName]: number }): Promise<void> {
    for (const pool in sleeps) {
      if (0 === sleeps[pool as PoolName]) {

        console.log(`\nUPDATE: "${pool}" (${this.smartYields[pool as PoolName]}) in update window ...`);

        const oracle = this.oraclesConnection[pool as PoolName].oracle;
        const periodSize = this.oraclesInfo[pool as PoolName].periodSize;
        const now = this.oraclesInfo[pool as PoolName].block.timestamp;

        if (!(await willUpdate(oracle, periodSize, now))) {
          console.log(`... skipping pool "${pool}" (${this.smartYields[pool as PoolName]}) as it wont update.`);
          continue;
        }

        const gasPrice = await this.gasPriceGetter();

        console.log(`... gas price is ${gasPrice.toString()}.`);
        console.log(`... calling update on "${pool}" (${this.smartYields[pool as PoolName]}).`);
        await doOracleUpdate(oracle, gasPrice);
      }
    }
    console.log('... updates done.');
  }

  public async updateLoop(): Promise<void> {
    await this.connect();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await this.getOraclesInfo();

      const sleeps = await this.getSleepSec();

      if (this.needsUpdate(sleeps)) {
        await this.doUpdates(sleeps);
        continue;
      }

      await this.sleep(sleeps);
    }
  }
}

const willUpdate = async (oracle: YieldOracle, periodSize: BN, now: number): Promise<boolean> => {
  const observationIndex = await oracle.observationIndexOf(now);
  const observation = await oracle.yieldObservations(observationIndex);
  const timeElapsed = BN.from(now).sub(observation.timestamp);
  console.log('timeElapsed is: ', timeElapsed.toString());
  console.log('periodSize  is: ', periodSize.toString());
  if (timeElapsed.gt(periodSize)) {
    return true;
  }
  return false;
};

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

const getObservations = async (oracle: YieldOracle, granularity: number) => {
  return await Promise.all(
    [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
  );
};

const mostRecentObservation = (observations: Observation[]) => {
  return observations.reduce(
    (prev, c) => {
      return prev.timestamp.gt(c.timestamp) ? prev : c;
    },
    observations[0]
  );
};

// 0 - should update
// n>0 - should sleep n seconds
const shouldSleep = (mostRecentObs: Observation, periodSize: BN, now: number, periodSizeSleepRatio: number): number => {
  const since = BN.from(now).sub(mostRecentObs.timestamp);
  const r = BN.from(Math.floor(periodSizeSleepRatio * 100));

  if (since.gte(periodSize.mul(r).div(100))) {
    return 0;
  }

  return periodSize.mul(r).div(100).sub(since).toNumber();
};

const doOracleUpdate = async (oracle: YieldOracle, gasPrice: BN) => {
  await (await oracle.update({ gasLimit: 500_000, gasPrice })).wait(3);
};

const connect = async (syAddr: string, sign: Signer) => {
  const smartYield = SmartYieldFactory.connect(syAddr, sign);
  const controller = CompoundControllerFactory.connect(await smartYield.controller(), sign);
  const oracle = YieldOracleFactory.connect(await controller.oracle(), sign);

  return { smartYield, controller, oracle };
};

const getOracleInfo = async (oracle: YieldOracle) => {
  const [windowSize, granularity, periodSize, block] = await Promise.all([
    oracle.windowSize(),
    oracle.granularity(),
    oracle.periodSize(),
    ethers.provider.getBlock('latest'),
  ]);

  const observations = await getObservations(oracle, granularity);
  const latestObservation = mostRecentObservation(observations);

  console.log('block.timestamp:', block.timestamp);
  console.log('windowSize: ', windowSize.toString());
  console.log('granularity:', granularity.toString());
  console.log('periodSize: ', periodSize.toString());
  console.log('yieldObservations:');
  observations.map((o, i) => {
    console.log(`[${i}]:`, o.timestamp.toString(), o.yieldCumulative.toString());
  });
  console.log('Latest yieldObservation:', latestObservation.timestamp.toString(), latestObservation.yieldCumulative.toString());
  console.log('First observation index:', ((await oracle.observationIndexOf(block.timestamp)) + 1) % (granularity));
  console.log('Update observation index:', (await oracle.observationIndexOf(block.timestamp)));
  console.log('---');

  return { windowSize, granularity, periodSize, observations, latestObservation, block };
};

export const walletBalance = async (address: string): Promise<BN> => {
  const balance = await ethers.provider.getBalance(address);
  if (balance.eq(0)) {
    console.error('no balance on address ' + address + '!');
    process.exit(-1);
  }
  return balance;
};

export const getGasPriceWeb3 = async (): Promise<BN> => {
  return BN.from(await web3.eth.getGasPrice());
};

export const getGasPriceEthGasStation = async (): Promise<BN> => {
  if (undefined === process.env.APIKEY_ETHGASSTATION) {
    console.error('env var APIKEY_ETHGASSTATION is not set!');
    process.exit(-1);
  }
  const url = 'https://ethgasstation.info/api/ethgasAPI.json?api-key=' + process.env.APIKEY_ETHGASSTATION;
  const req = await axios.get(url);
  return BN.from(req.data['fast']).mul(10 ** 9).div(10);
};

export const getGasPriceEtherscan = async (): Promise<BN> => {
  if (undefined === process.env.APIKEY_ETHERSCAN) {
    console.error('env var APIKEY_ETHERSCAN is not set!');
    process.exit(-1);
  }
  const url = 'https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=' + process.env.APIKEY_ETHERSCAN;
  const req = await axios.get(url);
  return BN.from(req.data['result']['FastGasPrice']).mul(10 ** 9);
};

export const getGasPriceGasNow = async (): Promise<BN> => {
  if (undefined === process.env.APIKEY_GASNOW) {
    console.error('env var APIKEY_GASNOW is not set!');
    process.exit(-1);
  }
  const url = 'https://www.gasnow.org/api/v3/gas/price?utm_source=' + process.env.APIKEY_GASNOW;
  const req = await axios.get(url);
  return BN.from(req.data['data']['fast']);
};

export const getGasPriceMainnet = async (): Promise<BN> => {

  try {
    return await getGasPriceEthGasStation();
  } catch (e) {
    console.error('Failed to get EthGasStation gas price:', e);
  }

  try {
    return await getGasPriceEtherscan();
  } catch (e) {
    console.error('Failed to get Etherscan gas price:', e);
  }

  try {
    return await getGasPriceGasNow();
  } catch (e) {
    console.error('Failed to get Gasnow gas price:', e);
  }

  try {
    return await getGasPriceWeb3();
  } catch (e) {
    console.error('Failed to get Web3 gas price:', e);
  }

  console.error('getGasPriceMainnet failed to get any price!');
  process.exit(-1);
};

export const getAllGasPrice = async (): Promise<{ EthGasStation: BN | null, Etherscan: BN | null, GasNow: BN | null, Web3: BN | null }> => {
  const rez: { EthGasStation: BN | null, Etherscan: BN | null, GasNow: BN | null, Web3: BN | null } = {} as { EthGasStation: BN | null, Etherscan: BN | null, GasNow: BN | null, Web3: BN | null };

  try {
    rez.EthGasStation = await getGasPriceEthGasStation();
  } catch (e) {
    rez.EthGasStation = null;
  }

  try {
    rez.Etherscan = await getGasPriceEtherscan();
  } catch (e) {
    rez.Etherscan = null;
  }

  try {
    rez.GasNow = await getGasPriceGasNow();
  } catch (e) {
    rez.GasNow = null;
  }

  try {
    rez.Web3 = await getGasPriceWeb3();
  } catch (e) {
    rez.Web3 = null;
  }

  return rez;
};

export const dumpAllGasPrices = async (): Promise<void> => {
  const gasPrices = await getAllGasPrice();
  for (const [provider, price] of Object.entries(gasPrices)) {
    (gasPrices as any)[provider] = price?.toString();
  }
  console.table(gasPrices);
};
