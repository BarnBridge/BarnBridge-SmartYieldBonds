// import 'tsconfig-paths/register';

// import { Wallet, BigNumber as BN } from 'ethers';
// import { run, ethers } from 'hardhat';
// import { YieldOracleFactory } from '@typechain/YieldOracleFactory';
// import { YieldOracle } from '@typechain/YieldOracle';

// const oracleAddr = '0xEF63aCbEc8Ac127E0a8728E7653A74db3987C800';

// export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
// export type Observation = ThenArg<ReturnType<YieldOracle['yieldObservations']>>;

// const getObservations = async (oracle: YieldOracle, granularity: number) => {
//   return await Promise.all(
//     [...Array(granularity).keys()].map(i => oracle.yieldObservations(i))
//   );
// };

// const mostRecentObservation = (observations: Observation[]) => {
//   observations
// }


// async function main() {

//   const [walletSign, ...signers] = (await ethers.getSigners()) as unknown[] as Wallet[];

//   console.log('Starting YieldOracle.update() bot ...');
//   console.log('wallet:', walletSign.address);

//   const oracle = YieldOracleFactory.connect(oracleAddr, walletSign);

//   const windowSize = await oracle.windowSize();
//   const granularity = await oracle.granularity();
//   const periodSize = await oracle.periodSize();

//   const block = await ethers.provider.getBlock('latest');

//   console.log('timestamp', block.timestamp);

//   console.log('windowSize ', windowSize.toString());
//   console.log('granularity', granularity.toString());
//   console.log('periodSize ', periodSize.toString());


//   const observations = await getObservations(oracle, granularity);

//   console.log('Observations:');
//   observations.map((o, i) => {
//     console.log(`[${i}]:`, o.timestamp.toString(), o.yieldCumulative.toString());
//   });

// }

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
