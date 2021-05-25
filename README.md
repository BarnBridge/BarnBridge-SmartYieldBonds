# Specs

are found in the [SPEC.md](./SPEC.md) file

# Smart Contract Architecture

![image](https://gblobscdn.gitbook.com/assets%2F-MIu3rMElIO-jG68zdaV%2F-MXHutr14sDo0hYi6gg3%2F-MXHwLefdUtdmBIqsexN%2Fsmart%20yield.png?alt=media&token=e4ddb985-c36c-4182-915d-befd37e2db4a)

# Getting Started

```bash
$ cp ./config.sample.ts ./config.ts
$ npm i
$ npm run compile
$ npm run test
$ npm run coverage
```

To run mainnet fork tests, add a forking section to `config.ts`:
```
    hardhat: {
      forking: {
        url: 'https://eth-mainnet.alchemyapi.io/v2/[KEY]',
      },
    },
```

and run the tests:
```
$ npm run test-mainnet
```

# Project Structure

## Tests

Tests are found in the `test/` folder. `test/helpers/` contains various test helpers.

## Contracts

Solidity 0.7.6 contracts are found in `contracts/`.

`contracts/external-interfaces/` contains interfaces external contracts, ie. liquidity providers such as compound.finance in `contracts/external-interfaces/compound-finance/`.

`contracts/mocks/` contains mock contracts unsed by tests.

`contracts/SmartYield.sol` smart yield implementation, contains all logic that is not liquidity provider specific. `SmartYield` also implements an ERC20 fungible token for juniors.

`contracts/providers/CompoundProvider.sol` contains liquidity provider specific code, provider is [compound.finance](http://compound.finance/). Other liquidity providers will receive their own separate impl.

`contracts/SeniorBond.sol` ERC721 non-fungible token for senior bonds.

`contracts/JuniorBond.sol` ERC721 non-fungible token for junior bonds.

`contracts/oracle/` contains a plugable oracle used by the pool to measure a moving average of the actual underlying pool yield.

`models/` contains plugable contracts for modeling the yield offered to senior bonds.

## Deploy Scripts

`scripts/deploy-*`
