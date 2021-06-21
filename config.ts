import 'dotenv/config';
import { HardhatUserConfig } from 'hardhat/config';

const config: HardhatUserConfig = {
    networks: {
        // Needed for `solidity-coverage`
        coverage: {
            forking: {
                url: process.env.PROVIDER_FORKING,
                blockNumber: Number(process.env.BLOCKNUMBER),
            },
            allowUnlimitedContractSize: true,
            url: 'http://localhost:8555',
        },

        hardhat: {
            forking: {
                url: process.env.PROVIDER_FORKING,
                blockNumber: Number(process.env.BLOCKNUMBER),
            },
        },

        env_network: {
            url: process.env.PROVIDER,
            chainId: Number(process.env.CHAINID),
            accounts: {
                mnemonic: process.env.MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 10
            },
            gas: "auto",
            gasPrice: 1000000000, // 1 gwei
            gasMultiplier: 1.5
        },

        // Mainnet
        mainnet: {
            url: process.env.PROVIDER,
            chainId: 1,
            accounts: ["0xaaaa"],
            gas: "auto",
            gasPrice: 50000000000,
            gasMultiplier: 1.5
        }
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN,
    },
};

export default config;
