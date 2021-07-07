let masterProvider: providers.JsonRpcProvider | undefined = undefined;
let masterConfig: HardhatConfig | undefined = undefined;
let mainnetProviderIndex = 0;
let testnetProviderIndex = 0;
let goerliProviderIndex = 0;
let polygonProviderIndex = 0;
let mumbaiProviderIndex = 0;

const mainnetRpcProviderUrls = [
  'https://mainnet.infura.io/v3/bcb0d67752d84ccfaf5a27d7d7084b03',
  'https://mainnet.infura.io/v3/7980b6bc9a9a4804877acae78e214525', // +infura1
  'https://mainnet.infura.io/v3/302f37044934401b8a6f8fdc6b8e56a3', // +infura2
  'https://mainnet.infura.io/v3/94d26fc947464eb89c247f92a42d1737', // +infura3
  'https://mainnet.infura.io/v3/c9a9e22e7a934e97ba1a4e29b90de102', // +infura4
  'https://mainnet.infura.io/v3/10c4bf16332e48a78681c09aed0696f9', // +infura5
  'https://mainnet.infura.io/v3/cf6780a68a6a49cb9049e22173a0b9c8', // +infura6
  'https://mainnet.infura.io/v3/7b5995940eb4442daf64118978606568', // +infura7
];

const testnetRpcProviderUrls = [
  'https://kovan.infura.io/v3/1e73db2462f44260b1708a31a331bfd6',
  'https://kovan.infura.io/v3/bdb7e97c01cc48819dca502db609d3c5', // +infura1
  'https://kovan.infura.io/v3/386879bd99f1464784912d63a449960b', // +infura2
  'https://kovan.infura.io/v3/38297b14e8644962aed82190f18ee80a', // +infura3
  'https://kovan.infura.io/v3/287dca8801ca46b6b496188ad077d2a1', // +infura4
  'https://kovan.infura.io/v3/dec7f10727064199a5c23c7a2c33bfbe', // +infura5
  'https://kovan.infura.io/v3/946b15e7b8d14ec8b8b9dc0e7ec1ee32', // +infura6
  'https://kovan.infura.io/v3/40c9673d401a40c994c5110c6a0b7317', // +infura7
];

const goerliRpcProviderUrls = [
  'https://goerli.infura.io/v3/1e73db2462f44260b1708a31a331bfd6',
  'https://goerli.infura.io/v3/bdb7e97c01cc48819dca502db609d3c5', // +infura1
  'https://goerli.infura.io/v3/386879bd99f1464784912d63a449960b', // +infura2
  'https://goerli.infura.io/v3/38297b14e8644962aed82190f18ee80a', // +infura3
  'https://goerli.infura.io/v3/287dca8801ca46b6b496188ad077d2a1', // +infura4
  'https://goerli.infura.io/v3/dec7f10727064199a5c23c7a2c33bfbe', // +infura5
  'https://goerli.infura.io/v3/946b15e7b8d14ec8b8b9dc0e7ec1ee32', // +infura6
  'https://goerli.infura.io/v3/40c9673d401a40c994c5110c6a0b7317', // +infura7
];

const polygonRpcProviderUrls = [
  'https://polygon-mainnet.infura.io/v3/dea9b5dfc59247d98577321e9aee9bee',
  'https://polygon-mainnet.infura.io/v3/517061d0f2144b388e5a8563e4e0463c', // +infura1
  'https://polygon-mainnet.infura.io/v3/585c123e356e470ea04f03f21fdf3344', // +infura2
  'https://polygon-mainnet.infura.io/v3/18c384c68e38437ead18ef6ec3c49257', // +infura3
  'https://polygon-mainnet.infura.io/v3/2ebc046896e142cfb0df185371a2fb31', // +infura4
  'https://polygon-mainnet.infura.io/v3/b60faf94ca41448e9115f291acedb40a', // +infura5
  'https://polygon-mainnet.infura.io/v3/55d9bf8593c54bdc89724465f7ffc5b3', // +infura6
  'https://polygon-mainnet.infura.io/v3/9b362991d4284cf282b51e0966450571', // +infura7
];

const mumbaiRpcProviderUrls = [
  'https://rpc-mumbai.maticvigil.com',
];

import axios from 'axios';
import _ from 'lodash';
import BNj from 'bignumber.js';
import { BigNumber as BN, Signer, providers, Wallet } from 'ethers';
import { createProvider } from 'hardhat/internal/core/providers/construction';
import { hardhatArguments, ethers, web3, config } from 'hardhat';
import { YieldOracleFactory } from '@typechain/YieldOracleFactory';
import { YieldOracle } from '@typechain/YieldOracle';
import { SmartYieldFactory } from '@typechain/SmartYieldFactory';
import { CompoundControllerFactory } from '@typechain/CompoundControllerFactory';
import { SmartYield } from '@typechain/SmartYield';
import { CompoundController } from '@typechain/CompoundController';
import { EthereumProvider, HardhatConfig } from 'hardhat/types';
import { A_DAY } from '@testhelp/index';

import { createUpdatableTargetProxy } from './updatable-target-proxy';
import { HARDHAT_NETWORK_RESET_EVENT } from 'hardhat/internal/constants';
import { EthersProviderWrapper } from './ethers-provider-wrapper';

export type PoolName = string;
export type SmartYields = { [key in PoolName]: string };
export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type Observation = ThenArg<ReturnType<YieldOracle['yieldObservations']>>;

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
}

type HarvestableData = {
  id: string,
  controller: CompoundController,
  lastHarvestedAt: number,
}

export class UpdaterFast {

  public oracles: OracleData[] = [];
  public harvestables: HarvestableData[] = [];

  public providerGetter: () => Promise<providers.JsonRpcSigner>;
  public gasPriceGetter: () => Promise<BN>;

  public updatePeriodWaitPercent: number;
  public maxSleepSec = 0;
  public harvestInterval: number;
  public harvestMin: BN;

  constructor(updatePeriodWaitPercent: number, harvestInterval: number, harvestMin: BN, providerGetter: () => Promise<providers.JsonRpcSigner>, gasPriceGetter: () => Promise<BN>) {
    this.updatePeriodWaitPercent = updatePeriodWaitPercent;
    this.harvestInterval = harvestInterval;
    this.harvestMin = harvestMin;
    this.providerGetter = providerGetter;
    this.gasPriceGetter = gasPriceGetter;
  }

  private async yieldObservations(oracleData: OracleData, index: number): Promise<{ timestamp: BN, yieldCumulative: BN }> {
    return await oracleData.oracle.connect(await this.providerGetter()).yieldObservations(index);
  }

  private async getCurrentBlock(): Promise<providers.Block> {
    const block = await (await this.providerGetter()).provider.getBlock('latest');
    return block;
  }

  public async initialize(sy: SmartYields, harvestable: string[]): Promise<void> {

    const block = await this.getCurrentBlock();

    for (const key in sy) {
      const connections = (await connect(sy[key], await this.providerGetter()));
      const properties = (await getOracleInfo(connections.oracle.connect(await this.providerGetter())));
      const oracle: OracleData = {
        id: key,
        smartYieldAddr: sy[key],
        oracleAddr: connections.oracle.address,
        ...connections,
        ...properties,
      };

      this.oracles.push(oracle);

      if (harvestable.includes(key)) {

        const h = {
          id: key,
          controller: oracle.controller,
          lastHarvestedAt: block.timestamp,
          //lastHarvestedAt: 0,
        };

        this.harvestables.push(h);
      }
    }

    this.maxSleepSec = this.oracles.reduce((maxSleep, o) => {
      if (maxSleep === 0) {
        return o.periodSize.toNumber();
      }
      return Math.min(maxSleep, o.periodSize.toNumber());
    }, 0);

    this.maxSleepSec = Math.ceil(this.maxSleepSec / 2);
  }

  private secondsUntilHarvest(blockTimestamp: BN, harvestable: HarvestableData): number {
    const harvestTimeElapsed = blockTimestamp.sub(harvestable.lastHarvestedAt);
    const secToHarvest = BN.from(this.harvestInterval).sub(harvestTimeElapsed).toNumber();
    if (0 > secToHarvest) {
      // can harvest
      return 0;
    }

    return secToHarvest;
  }

  private async shouldHarvest(harvestable: HarvestableData): Promise<number> {
    try {
      const { 0: rewardExpected } = await harvestable.controller.connect(await this.providerGetter()).callStatic.harvest(0);
      console.log(`... harvest reward: ${rewardExpected.toString()} (min: ${this.harvestMin.toString()})`);
      if (rewardExpected.gte(this.harvestMin)) {
        // harvest
        return 0;
      }
      return A_DAY;
    } catch (e) {
      console.log('... harvest call fails:', e);
      // failed to read contract
      return this.harvestInterval;
    }
  }

  private async doHarvest(harvestable: HarvestableData) {
    const gasPrice = await this.gasPriceGetter();
    console.log(`... gasPrice=${gasPrice.toString()}`);
    await (await harvestable.controller.connect(await this.providerGetter()).harvest(0, { gasLimit: 1_000_000, gasPrice })).wait(1);
    const block = await this.getCurrentBlock();
    harvestable.lastHarvestedAt = block.timestamp;
  }

  private secondsUntilShouldUpdate(blockTimestamp: BN, oracle: OracleData): number {
    const periodStart = periodStartOf(blockTimestamp, oracle.periodSize);
    const periodElapsed = blockTimestamp.sub(periodStart);
    const periodWait = oracle.periodSize.mul(BN.from(Math.floor(this.updatePeriodWaitPercent * 100000))).div(100000);

    const sleepNeeded = periodWait.sub(periodElapsed).toNumber();

    if (0 >= sleepNeeded) {
      return 0;
    }

    return sleepNeeded;
  }

  private async willUpdate(blockTimestamp: BN, oracle: OracleData): Promise<number> {
    const index = observationIndexOf(blockTimestamp, oracle.periodSize, oracle.granularity);
    const { timestamp: observationTimestamp } = await this.yieldObservations(oracle, index);
    const observationElapsed = blockTimestamp.sub(observationTimestamp);
    if (observationElapsed.lte(oracle.periodSize)) {
      // updated, wakeup after period end
      return periodEndOf(blockTimestamp, oracle.periodSize).sub(blockTimestamp).toNumber();
    }
    // can be updated
    return 0;
  }

  private async doOracleUpdate(oracle: OracleData) {
    const gasPrice = await this.gasPriceGetter();
    console.log(`... gasPrice=${gasPrice.toString()}`);
    await (await oracle.oracle.connect(await this.providerGetter()).update({ gasLimit: 400_000, gasPrice })).wait(1);
  }

  public async updateLoop(): Promise<void> {

    // eslint-disable-next-line no-constant-condition
    while (true) {

      let sleepSeconds = this.maxSleepSec;

      for (let f = 0; f < this.oracles.length; f++) {
        console.log(`Oracle ${this.oracles[f].oracleAddr} (${this.oracles[f].smartYieldAddr} ${this.oracles[f].id}) ...`);
        const block = await this.getCurrentBlock();
        console.log(`... block ${block.number} (@${block.timestamp}), period ${periodStartOf(BN.from(block.timestamp), this.oracles[f].periodSize)} - ${periodEndOf(BN.from(block.timestamp), this.oracles[f].periodSize)}`);
        // how long to wait for others to updated the oracle. 0 == in update window
        let sleep = this.secondsUntilShouldUpdate(BN.from(block.timestamp), this.oracles[f]);
        console.log(`... sleep until update window ${sleep}s`);
        if (0 === sleep) {
          // has it already been updated. 0 == yes
          sleep = await this.willUpdate(BN.from(block.timestamp), this.oracles[f]);
          console.log(`... will update ${sleep}s (${0 === sleep ? 'yes' : 'skip, wait until next period'})`);
        }

        if (0 === sleep) {
          // update
          console.log('... updating');
          await this.doOracleUpdate(this.oracles[f]);
          console.log('... done.');
          continue;
        }

        sleepSeconds = Math.min(sleep, sleepSeconds);
      }

      for (let f = 0; f < this.harvestables.length; f++) {
        console.log(`Harvestable ${this.harvestables[f].controller.address} ${this.harvestables[f].id} ...`);
        const block = await this.getCurrentBlock();
        console.log(`... block ${block.number} (@${block.timestamp})`);

        let sleep = this.secondsUntilHarvest(BN.from(block.timestamp), this.harvestables[f]);
        console.log(`... sleep until harvest ${sleep}s`);

        if (0 === sleep) {
          sleep = await this.shouldHarvest(this.harvestables[f]);
          console.log(`... will harvest ${sleep}s (${0 === sleep ? 'yes' : 'skip, wait'})`);
        }

        if (0 === sleep) {
          console.log('... harvesting');
          await this.doHarvest(this.harvestables[f]);
          console.log('... done.');
          continue;
        }

        sleepSeconds = Math.min(sleep, sleepSeconds);
      }

      console.log(`Sleeping ${sleepSeconds}s ...`);
      await sleep(sleepSeconds * 1000);
    }
  }
}

export const getProviderMainnet = async (): Promise<providers.JsonRpcSigner> => {

  const provider = await buildProvider(mainnetRpcProviderUrls[mainnetProviderIndex]);
  mainnetProviderIndex = (++mainnetProviderIndex) % mainnetRpcProviderUrls.length;

  return provider;
};

export const getProviderTestnet = async (): Promise<providers.JsonRpcSigner> => {

  const provider = await buildProvider(testnetRpcProviderUrls[testnetProviderIndex]);
  testnetProviderIndex = (++testnetProviderIndex) % testnetRpcProviderUrls.length;

  return provider;
};

export const getProviderGoerli = async (): Promise<providers.JsonRpcSigner> => {

  const provider = await buildProvider(goerliRpcProviderUrls[goerliProviderIndex]);
  goerliProviderIndex = (++goerliProviderIndex) % goerliRpcProviderUrls.length;

  return provider;
};

export const getProviderMumbai = async (): Promise<providers.JsonRpcSigner> => {

  const provider = await buildProvider(mumbaiRpcProviderUrls[mumbaiProviderIndex]);
  mumbaiProviderIndex = (++mumbaiProviderIndex) % mumbaiRpcProviderUrls.length;

  return provider;
};

export const getProviderPolygon = async (): Promise<providers.JsonRpcSigner> => {

  const provider = await buildProvider(polygonRpcProviderUrls[polygonProviderIndex]);
  polygonProviderIndex = (++polygonProviderIndex) % polygonRpcProviderUrls.length;

  return provider;
};

const buildProvider = async (providerUrl: string): Promise<providers.JsonRpcSigner> => {

  function createProviderProxy(
    hardhatProvider: EthereumProvider
  ): EthersProviderWrapper {
    const initialProvider = new EthersProviderWrapper(hardhatProvider);

    const { proxy: providerProxy, setTarget } = createUpdatableTargetProxy(
      initialProvider
    );

    hardhatProvider.on(HARDHAT_NETWORK_RESET_EVENT, () => {
      setTarget(new EthersProviderWrapper(hardhatProvider));
    });

    return providerProxy;
  }


  if (masterProvider === undefined) {
    masterProvider = _.cloneDeep(ethers.provider);
  }

  if (undefined === masterConfig) {
    masterConfig = _.cloneDeep(config);
  }

  const networkName = hardhatArguments.network || 'hardhat';

  const provider = createProvider(
    networkName,
    {
      ...masterConfig.networks[networkName],
      url: providerUrl,
    }
  );

  return await createProviderProxy(provider).getSigner();
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

const observationIndexOf = (timestamp: BN, periodSize: BN, granularity: number): number => {
  const epochPeriod = timestamp.div(periodSize);
  return epochPeriod.mod(granularity).toNumber();
};

const periodStartOf = (timestamp: BN, periodSize: BN): BN => {
  return timestamp.div(periodSize).mul(periodSize);
};

const periodEndOf = (timestamp: BN, periodSize: BN): BN => {
  return periodStartOf(timestamp, periodSize).add(periodSize).sub(1);
};

const connect = async (syAddr: string, sign: Signer | providers.Provider) => {
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

export const getGasPricePolygonGasStation = async (): Promise<BN> => {
  const url = 'https://gasstation-mainnet.matic.network';;
  const req = await axios.get(url);
  const toWeiStr = (new BNj(req.data['fast'])).times(10 ** 9).toFixed(0);
  return BN.from(toWeiStr);
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

export const getGasPricePolygon = async (): Promise<BN> => {

  try {
    return await getGasPricePolygonGasStation();
  } catch (e) {
    console.error('Failed to get EthGasStation gas price:', e);
  }

  try {
    return await getGasPriceWeb3();
  } catch (e) {
    console.error('Failed to get Web3 gas price:', e);
  }

  console.error('getGasPricePolygon failed to get any price!');
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

export const getAllGasPricePolygon = async (): Promise<{ PolygonGasStation: BN | null, Web3: BN | null }> => {
  const rez: { PolygonGasStation: BN | null, Web3: BN | null } = {} as { PolygonGasStation: BN | null, Web3: BN | null };

  try {
    rez.PolygonGasStation = await getGasPricePolygonGasStation();
  } catch (e) {
    rez.PolygonGasStation = null;
  }

  try {
    rez.Web3 = await getGasPriceWeb3();
  } catch (e) {
    rez.Web3 = null;
  }

  return rez;
};

export const dumpAllGasPricesPolygon = async (): Promise<void> => {
  const gasPrices = await getAllGasPricePolygon();
  for (const [provider, price] of Object.entries(gasPrices)) {
    (gasPrices as any)[provider] = price?.toString();
  }
  console.table(gasPrices);
};
