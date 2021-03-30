import 'tsconfig-paths/register';
// -----

const oracleAddr = '0x95D79e6045b8A08a017c78135422A4010052D1d1';
const smartYieldAddr = '0x2327c862E8770E10f63EEF470686fFD2684A0092';

// -----
import { Wallet, BigNumber as BN } from 'ethers';
import { ethers } from 'hardhat';
import { YieldOracleFactory } from '@typechain/YieldOracleFactory';
import { YieldOracle } from '@typechain/YieldOracle';
import { SmartYieldFactory } from '@typechain/SmartYieldFactory';
import { ICTokenFactory } from '@typechain/ICTokenFactory';
import { CompoundProviderFactory } from '@typechain/CompoundProviderFactory';
import { ICToken } from '@typechain/ICToken';

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
  await (await oracle.update({ gasLimit: 500_000 })).wait(1);
};

async function main() {

  const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

  console.log('Starting YieldOracle.update() bot ...');
  console.log('wallet:', walletSign.address);

  const oracle = YieldOracleFactory.connect(oracleAddr, walletSign);

  const smartYield = SmartYieldFactory.connect(smartYieldAddr, walletSign);
  const provider = CompoundProviderFactory.connect(await smartYield.pool(), walletSign);
  const cToken = ICTokenFactory.connect(await provider.cToken(), walletSign);

  const windowSize = await oracle.windowSize();
  const granularity = await oracle.granularity();
  const periodSize = await oracle.periodSize();

  console.log('windowSize: ', windowSize.toString());
  console.log('granularity:', granularity.toString());
  console.log('periodSize: ', periodSize.toString());

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
        1
      );

      console.log('will sleep (sec):', sleepSec);

      if (sleepSec === 0) {

        console.log('calling update ...');
        await doOracleUpdate(oracle);
        console.log('called.');
        await sleep(30 * 60 * 1000);
        continue;
      }

      await sleep(sleepSec * 1000);
    } catch (e) {
      console.error('ERROR:', e);
      await sleep(60 * 1000);
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
