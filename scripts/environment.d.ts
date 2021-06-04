declare global {
  namespace NodeJS {
    interface ProcessEnv {
      CHAIN: string;
      CHAINID: string;
      INFURA: string;
      ETHERSCAN: string;
      ALCHEMY: string;
      MNEMONIC: string;
      DEPLOY_ALL: string;
      DEPLOY_CUSDC: string;
      DEPLOY_CDAI: string;
      DEPLOY_AUSDC: string;
      DEPLOY_AUSDT: string;
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
      CDAI: string;
      AUSDC: string;
      AUSDT: string;
      AGUSD: string;
      ADAI: string;
      CRUSDC: string;
      CRDAI: string;
      CRUSDT: string;
      PRINTENV: string;
    }
  }
}

// convert file into a module by adding an empty export statement.
export {}
