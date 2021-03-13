import 'tsconfig-paths/register';
// -----

const oracleAddr = '0xbd45Dba10b4E2A81040b7511FF4c210Eb590b817';
const smartYieldAddr = '0x4B8d90D68F26DEF303Dcb6CFc9b63A1aAEC15840';

const gasStationUrl = process.env.GAS_STATION_URL;

// -----
import { Wallet, BigNumber as BN } from 'ethers';
import { ethers } from 'hardhat';
import axios from 'axios';
import { YieldOracleFactory } from '@typechain/YieldOracleFactory';
import { YieldOracle } from '@typechain/YieldOracle';
import { SmartYieldFactory } from '@typechain/SmartYieldFactory';
import { ICTokenFactory } from '@typechain/ICTokenFactory';
import { CompoundProviderFactory } from '@typechain/CompoundProviderFactory';


export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type Observation = ThenArg<ReturnType<YieldOracle['yieldObservations']>>;

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

const doOracleUpdate = async (oracle: YieldOracle) => {
  const gasPrice = await getGasPrice();
  console.log('gas price is :', gasPrice.toString());
  await (await oracle.update({ gasLimit: 500_000, gasPrice })).wait(1);
};

const getGasPrice = async(): Promise<BN> => {
  if (undefined === gasStationUrl) {
    console.error('evn var GAS_STATION_URL is not set!');
    process.exit(-1);
  }
  const req = await axios.get(gasStationUrl);
  return BN.from(req.data['fast']).mul(10**9).div(10);
};

const walletBalance = async(address: string): Promise<BN> => {
  const balance = await ethers.provider.getBalance(address);
  if (balance.eq(0)) {
    console.error('no balance on address ' + address + '!');
    process.exit(-1);
  }
  return balance;
};

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet:', walletSign.address);

  console.log('wallet balance:', (await walletBalance(walletSign.address)).toString());
  console.log('gas price is:', (await getGasPrice()).toString());

  const oracle = YieldOracleFactory.connect(oracleAddr, walletSign);

  const smartYield = SmartYieldFactory.connect(smartYieldAddr, walletSign);
  const provider = CompoundProviderFactory.connect(await smartYield.pool(), walletSign);
  const cToken = ICTokenFactory.connect(await provider.cToken(), walletSign);

  const windowSize = await oracle.windowSize();
  const granularity = await oracle.granularity();
  const periodSize = await oracle.periodSize();

  console.log('windowSize :', windowSize.toString());
  console.log('granularity:', granularity.toString());
  console.log('periodSize :', periodSize.toString());

  while (true) {
    try {
      const [observations, block] = await Promise.all([
        getObservations(oracle, granularity),
        ethers.provider.getBlock('latest'),
      ]);

      console.log('block.timestamp:', block.timestamp);
      console.log('Observations:');
      observations.map((o, i) => {
        console.log(`[${i}]:`, o.timestamp.toString(), o.yieldCumulative.toString());
      });

      const sleepSec = shouldSleep(
        mostRecentObservation(observations),
        periodSize,
        block.timestamp,
        0.9
      );

      console.log('will sleep (sec):', sleepSec);

      if (sleepSec === 0) {
        console.log('calling update ...');
        await doOracleUpdate(oracle);
        console.log('called.');
        await sleep(60 * 1000);
        continue;
      }

      await sleep(sleepSec * 1000);
    } catch (e) {
      console.error('ERROR:', e);
      console.error('exiting!');
      process.exit(-1);

    }
  }

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
