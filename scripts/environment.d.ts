declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHAIN: string;
      CHAINID: string;
      PROVIDER: string;
      ETHERSCAN: string;
      PROVIDER_FORKING: string;
      BLOCKNUMBER: string;
      MNEMONIC: string;
      DEPLOY_ALL: string;
      DEPLOY_CUSDC: string;
      DEPLOY_CUSDT: string;
      DEPLOY_CDAI: string;
      DEPLOY_AUSDC: string;
      DEPLOY_AUSDT: string;
      DEPLOY_AGUSD: string;
      DEPLOY_ADAI: string;
      DEPLOY_ARAI: string;
      DEPLOY_ASUSD: string;
      DEPLOY_CRUSDC: string;
      DEPLOY_CRUSDT: string;
      DEPLOY_CRDAI: string;
      BOND: string;
      DAO: string;
      COMP: string;
      USDC: string;
      WETH: string;
      DAI: string;
      CUSDC: string;
      CUSDT: string;
      CDAI: string;
      AUSDC: string;
      AUSDT: string;
      AGUSD: string;
      ADAI: string;
      ARAI: string;
      ASUSD: string;
      CRUSDC: string;
      CRDAI: string;
      CRUSDT: string;
      PRINTENV: string;
    }
  }
}

// convert file into a module by adding an empty export statement.
export {}
