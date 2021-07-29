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
    
## Updating the .env file
### Create an API key with a Provider that supports Forking such as Alchemy Labs to run Mainnet Forking tests
Alchemy.io can be used to fork the current state of the Mainnet into your development environment. A free account will suffice. 

1. Navigate to [Alchemy](https://alchemyapi.io) and create an account.
2. Log in and create a new Project on Mainnet. 
3. Navigate to the [Dashboard](https://dashboard.alchemyapi.io/) and click View Key.  Paste the URL into the section labeled PROVIDER_FORKING in the `.env` file. 
(Optional: update sectionlabeled BLOCKNUMBER in the `.env` file to fork a more recent state, at time of writing it is `12488859`)

### Create an API key with a Provider to deploy to Ethereum Public Testnets. In this guide, we are using Infura on Kovan.
4. Navigate to [Infura.io](https://infura.io/) and create an account
5. Log in and select "Get started and create your first project to access the Ethereum network"
6. Create a project and name it appropriately. On the Settings page, switch the Network to Kovan and note the project URL ie https://kovan.infura.io/v3/INFURA-API-KEY
7. Copy the Project URL and paste it into the section labeled PROVIDER in the `.env` file.

### Create an API key with Etherscan 
8. Navigate to [EtherScan](https://etherscan.io/) and create an account 
9. Log in and navigate to [MyAPIKey](https://etherscan.io/myapikey) 
10. Use the Add button to create an API key, and paste it into the section labeled ETHERSCAN in the `.env` file

### Optional: Insert your own deployment of Governance.Sol contract address
11. If you deployed Governance.sol from BarnBridge-DAO, insert the contract address into the field labeled DAO in the `.env` file.

### Update the .env file with your test wallet info
12. Insert the mnemonic phrase for your testing wallet into the `.env` file. You can use a MetaMask instance, and switch the network to Kovan on the upper right. DO NOT USE YOUR PERSONAL METAMASK SEED PHRASE; USE A DIFFERENT BROWSER WITH AN INDEPENDENT METAMASK INSTALLATION
13. You'll need some Kovan-ETH (it is free) in order to pay the gas costs of deploying the contracts on the TestNet; you can use your GitHub account to authenticate to the [KovanFaucet](https://faucet.kovan.network/) and receive 2 Kovan-ETH for free every 24 hours
14. Use the [BarnBridgeFaucet](https://testnet.app.barnbridge.com/faucets) to swap some of your kETH for BOND, and also get test tokens for the originator platforms

### Optional: Modify Deployment Controls in the .env file
15. If you would only like to deploy certain SmartYield components, comment out DEPLOY_ALL in the `.env` file and un-comment out the components you'd like to deploy.

### Copy config.ts.dotenv to config.ts
    cp config.ts.dotenv config.ts

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
Optional: Update the `.env` file indicating which specific Smart Yield pools you would like to deploy, or leave it as the default DEPLOY_ALL
### Use the code in the scripts folder to deploy the contracts on Kovan

    npm run deploy-from-env

### Optional: Deploy the Bot to further test the live contracts!
Update bot-kovan-oracle-update.ts with the oracle addresses from deploy-from-env.

    npx hardhat run --network kovan scripts/bot-kovan-oracle-update.ts 

    # Press ctl+c to stop


## Discussion
For any concerns with the platform, open an issue on GitHub or visit us on [Discord](https://discord.gg/9TTQNUzg) to discuss.
For security concerns, please email info@barnbridge.com.

Copyright 2021 BarnBridge DAO
