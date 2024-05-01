# Automated Builder Billing for MEV Blocker

On April 10, 2024, MEV Blocker Private RPC started charging a fee paid by the builders.
The accounting processes are seeded through the [MEVBlockerFeeTill](https://github.com/cowprotocol/mev-blocker-till) contract deployed on Ethereum mainnet at [0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a](https://etherscan.io/address/0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a).

The billing process is achieved through calling the `bill` method on this contract (restricted to `onlyBiller`).
The data supplied to the billing method is aggregated by the following [Dune](https://dune.com) queries:

1. [MEV Blocker - Fee per block](https://dune.com/queries/3634734)
2. [MEV Blocker - Payment Due](https://dune.com/queries/3630322)

## Verified Contracts

```sh
https://etherscan.io/address/0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a#writeContract
```

```
https://sepolia.etherscan.io/address/0x2ad5fcddf209ca9e01509ecfa77115d3a9f999fa#writeContract
```

## Local Development: Install, Set ENV & Run

```sh
# Install
yarn
# Copy and fill env vars
cp .env.sample .env
```

Some values are filled, but others require secrets.

Run the Script

```sh
yarn run main
```

## Docker

```sh
docker build -t mb-billing .
docker run --env-file .env mb-billing
```
