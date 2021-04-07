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

export type PoolName = 'USDC/compound/v1' | 'DAI/compound/v1';
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
    const updates = [];
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
        updates.push(
          doOracleUpdate(oracle, gasPrice)
        );
      }
    }

    if (0 === updates.length) {
      return;
    }

    console.log('... waiting for updates to finish.');
    await Promise.all(updates);
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
  console.log('---');

  return { windowSize, granularity, periodSize, observations, latestObservation, block };
};

export const walletBalance = async(address: string): Promise<BN> => {
  const balance = await ethers.provider.getBalance(address);
  if (balance.eq(0)) {
    console.error('no balance on address ' + address + '!');
    process.exit(-1);
  }
  return balance;
};

export const getGasPriceMainnet = async(): Promise<BN> => {
  if (undefined === process.env.GAS_STATION_URL) {
    console.error('env var GAS_STATION_URL is not set!');
    process.exit(-1);
  }
  const req = await axios.get(process.env.GAS_STATION_URL);
  return BN.from(req.data['fast']).mul(10**9).div(10);
};

export const getGasPriceTest = async(): Promise<BN> => {
  return BN.from(await web3.eth.getGasPrice());
};

