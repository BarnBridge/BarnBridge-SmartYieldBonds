# Specs

are found in the [SPEC.md](./SPEC.md) file

# Getting Started

```bash
$ cp ./config.sample.ts ./config.ts
$ npm i
$ npm run compile
$ npm run test
$ npm run coverage
```
# Project Structure

## Tests

Tests are found in the `test/` folder. `test/helpers/` contains various test helpers.

## Contracts

Solidity 0.7.5 contracts are found in `contracts/`.

`contracts/external-interfaces/` contains interfaces external contracts, ie. liquidity providers such as compound.finance in `contracts/external-interfaces/compound-finance/`.

`contracts/mocks/` contains mock contracts unsed by tests.

`contracts/ASmartYieldPool.sol` abstract smart yield pool implementation, contains all logic that is not liquidity provider specific. `ASmartYieldPool` also implements an ERC20 fungible token for juniors.

`contracts/SmartYieldPoolCompound.sol` concrete implementation of a smart yield pool, using [compound.finance](http://compound.finance/) as a liquidity provider. Other liquidity providers will receive their own separate concrete impl.

`contracts/BondToken.sol` ERC721 non-fungible token for senior bonds.

`contratcs/oracle/` contains a plugable oracle used by the pool to measure a roling average of the actual underlying pool yield.

`models/` contains plugable contracts for modeling the yield offered to senior bonds.

## Deploy Scripts

TBD.
