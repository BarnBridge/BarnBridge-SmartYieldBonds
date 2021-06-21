# BarnBridge SMART Yield
![](https://i.imgur.com/6wiaNwP.png)

SMART Yield is an Ethereum platform for creating multiple risk profiles (e.g., “tranches”) out of singular debt pools across platforms like Compound Finance or AAVE. Accounts can enter pools like cUSDC or aDAI either via the junior tranche contract or the senior tranche contract. The SMART Yield contracts track these positions as either fungible tokens (ERC-20) or non-fungible tokens (ERC-721). 

Learn More:
* [Beginners' Guide](https://docs.barnbridge.com/beginners-guide-to-smart-yield)
* [Advanced Guide](https://drive.google.com/file/d/1sfY_N2xf503m7Gl02rmIoRllVgcBwUWH/view?usp=sharing)

Any questions? Please contact us on [Discord](https://discord.gg/FfEhsVk) or read our [Developer Guides](https://integrations.barnbridge.com/) for more information.

## Specifications
Contract Specifications can be found at [Specifications](https://github.com/BarnBridge/BarnBridge-SmartYieldBonds/blob/master/SPEC.md)

## Audits
* [Open Zeppelin](https://github.com/BarnBridge/BarnBridge-PM/blob/master/audits/BarnBridge%20SMART%20Yield%20audit%20by%20Open%20Zeppelin.pdf)
* [Hacken (Compound)](https://github.com/BarnBridge/BarnBridge-PM/blob/master/audits/BarnBridge%20SMART%20Yield%20(compound)%20audit%20by%20Hacken.pdf)
* [Hacken (Aave & Cream)](https://github.com/BarnBridge/BarnBridge-PM/blob/master/audits/BarnBridge%20SMART%20Yield%20(aave%2Bcream)%20audit%20by%20Hacken.pdf)

## Contracts
### SmartYield.sol
SMART Yield implementation, contains all logic that is not liquidity provider specific. SmartYield also implements an ERC20 fungible token for juniors.

### SeniorBond.sol
ERC721 non-fungible token for senior bonds.

### JuniorToken.sol
ERC20 fungible token for juniors.

### JuniorBond.sol
ERC721 non-fungible token for junior bonds.

### ISmartYield.sol
Interface for the Smart Yield implementation.

### IController.sol
Interface for the Smart Yield implementation and how it interacts with the DAO (e.g. fee calculations and harvesting). The interface implements `Governed.sol`.

### IProvider.sol
Interface for the `Provider` implementation relating to originators (such as Compound and Aave). You can find the specific provider contracts on `/contracts/providers/` 

### IBond.sol
Interface for issuing ERC721 non-fungible tokens.

### Governed.sol
Interface for the DAO and governance. 

### External Interfaces [Folder]
`contracts/external-interfaces/` contains all interfaces to external DeFi protocols such as Compound, Aave, Cream and Uniswap.

### Lib [Folder]
`contracts/lib/` contains common utilities from Uniswap and mathematical functions MathUtils.sol that are used in our smart contracts and various application logic.

### Mocks [Folder]
`contracts/mocks/` contains mock smart contracts used by our tests. Our tests can be found on the `test/` and `test-mainnet/` folders. 

### Model [Folder]
`contracts/model/` refers to logic in relation to the interest rate calculation and BOND rewards.

### Oracle [Folder]
`contracts/oracle` contains a plugable oracle used by the pool to measure a moving average of the actual underlying pool yield. See [Understanding the oracles](#) on our Developer Documentation for more details on how our oracles work.

### Providers [Folder]
`contracts/providers` contains integration logic to our originators (such as Compound, Cream and Aave).

## Smart Contract Architecture
![](https://gblobscdn.gitbook.com/assets%2F-M_LfnzPLAW6BY3XlMxl%2F-M_PZIBaovfD7QrohlgL%2F-M_PZjtoerJ6jCra6UbD%2Fsy.png?alt=media&token=de040cd0-688c-4087-bbd8-b5bd0a72889a)

Check out more detailed smart contract Slither graphs with all the dependecies: [SMART Yield Slither Charts](https://github.com/BarnBridge/sc-graphs/tree/main/BarnBridge-SmartYieldBonds).


## Initial Setup

### Install NVM and the latest version of NodeJS 12.x
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash 
    # Restart terminal and/or run commands given at the end of the installation script
    nvm install 12
    nvm use 12
### Use Git to pull down the BarnBridge-SmartYieldBonds repository from GitHub
    git clone https://github.com/BarnBridge/BarnBridge-SmartYieldBonds.git
    cd BarnBridge-SmartYieldBonds
### Create config.ts using the sample template config.sample.ts
    cp config.sample.ts config.ts
    
## Updating config.ts

### Create an API key with Alchemy Labs to run Mainnet Forking tests

Alchemy.io can be used to fork the current state of the Mainnet into your development environment. A free account will suffice. 

1. Navigate to [Alchemy](https://alchemyapi.io) and create an account.
2. Log in and create a new Project on Mainnet. 
3. Navigate to the [Dashboard](https://dashboard.alchemyapi.io/) and copy the HTTPS link for your account. The link is in the form `https://eth-mainnet.alchemyapi.io/v2/<YOURAPIKEY>`. This can be configured in the `forking` sections of the `config.ts`. (Optional: update `blockNumber` to fork a more recent state, at time of writing it is `12488859`)

### Create an API key with Infura to deploy to Ethereum Public Testnets. In this guide, we are using Kovan.

1. Navigate to [Infura.io](https://infura.io/) and create an account
2. Log in and select "Get started and create your first project to access the Ethereum network"
3. Create a project and name it appropriately
4. On the Settings page, with Mainnet selected, copy the HTTPS URL and paste it in the `mainnet` section of `config.ts`
5. Then, switch the endpoint to Kovan, copy the https URL and paste it into the section previously named `rinkeby` in the config.ts file, and rename the section to `kovan`. 
6. Update the chainId to that of Kovan, 42
7. Finally, insert the mnemonic phrase for your testing wallet. You can use a MetaMask instance, and switch the network to Kovan on the upper right. DO NOT USE YOUR PERSONAL METAMASK SEED PHRASE; USE A DIFFERENT BROWSER WITH AN INDEPENDENT METAMASK INSTALLATION
8. You'll need some Kovan-ETH (it is free) in order to pay the gas costs of deploying the contracts on the TestNet; you can use your GitHub account to authenticate to the [KovanFaucet](https://faucet.kovan.network/) and receive 2 Kovan-ETH for free every 24 hours

### Create an API key with Etherscan 
1. Navigate to [EtherScan](https://etherscan.io/) and create an account 
2. Log in and navigate to [MyAPIKey](https://etherscan.io/myapikey) 
3. Use the Add button to create an API key, and paste it into the indicated section towards the bottom of the `config.ts` file

### Verify contents of config.ts; it should look like this:

```js
    import { HardhatUserConfig } from 'hardhat/config';
    const config: HardhatUserConfig = {
        // Your type-safe config goes here
        networks: {
            // Needed for `solidity-coverage`
            coverage: {
                forking: {
                    url: 'https://eth-mainnet.alchemyapi.io/v2/API-KEY-HERE',
                    blockNumber: 12488859,
                },
                allowUnlimitedContractSize: true,
                url: 'http://localhost:8555',
            },
            hardhat: {
                forking: {
                    url: 'https://eth-mainnet.alchemyapi.io/v2/API-KEY-HERE',
                    blockNumber: 12488859,
                },
            },
            // Kovan
            kovan: {
                url: 'https://kovan.infura.io/v3/API-KEY-HERE',
                chainId: 42, // Kovan Chain ID is 42
                accounts: {
                    mnemonic: '<YourKovanTestWalletMnemonicPhrase>',
                    path: 'm/44\'/60\'/0\'/0',
                    initialIndex: 0,
                    count: 10,
                },
                gas: 'auto',
                gasPrice: 1000000000, // 1 gwei
                gasMultiplier: 1.5,
            },
            // Mainnet
            mainnet: {
                url: 'https://mainnet.infura.io/v3/API-KEY-HERE',
                chainId: 1,
                accounts: {
                    mnemonic: '<USEWITHCAUTION!!!>',
                    path: 'm/44\'/60\'/0\'/0',
                    initialIndex: 1,
                    count: 10,
                },
                gas: 'auto',
                gasPrice: 73000000000, // 1 gwei
                gasMultiplier: 1.5,
            },
        },
        // Use to verify contracts on Etherscan
        // https://buidler.dev/plugins/nomiclabs-buidler-etherscan.html
        etherscan: {
            apiKey: '<EtherScanAPIkey>',
        },
    };
    export default config;
```
## Installing

### Install NodeJS dependencies which include HardHat
    npm install
### Compile the contracts
    npm run compile
    
## Running Tests

    npm run test

## Running Code Coverage Tests

    npm run coverage

## MainNet Forking


    npm run test-mainnet    
    
## Deploying to Kovan

### Use the code in the scripts folder to deploy the contracts on Kovan

    npx hardhat run --network kovan scripts/deploy-kovan-aave-dai.ts
    npx hardhat run --network kovan scripts/deploy-kovan-aave-usdc.ts
    npx hardhat run --network kovan scripts/deploy-kovan-aave-usdt.ts
    npx hardhat run --network kovan scripts/deploy-kovan-compound-dai.ts
    npx hardhat run --network kovan scripts/deploy-kovan-compound-usdc.ts
    npx hardhat run --network kovan scripts/deploy-kovan-cream-usdc.ts
    npx hardhat run --network kovan scripts/deploy-kovan-bondmodel-v2-compounded.ts

### Deploy the Bot to further test the live contracts!

    npx hardhat run --network kovan scripts/bot-kovan-oracle-update.ts 

    # Press ctl+c to stop
    
## Discussion
For any concerns with the platform, open an issue on GitHub or visit us on [Discord](https://discord.gg/9TTQNUzg) to discuss.
For security concerns, please email info@barnbridge.com.

Copyright 2021 BarnBridge DAO
