# Automated Builder Billing for MEV Blocker

On April 10, 2024, MEV Blocker Private RPC started charging a fee paid by the builders.
The accounting processes are seeded through the [MEVBlockerFeeTill](https://github.com/cowprotocol/mev-blocker-till) contract deployed on Ethereum Mainnet at [0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a](https://etherscan.io/address/0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a).

The billing process is achieved through calling the `bill` method on this contract (restricted to `onlyBiller`).
The data supplied to the billing method is aggregated by the following:

### [Dune](https://dune.com) Queries:

- **Fee per block:** https://dune.com/queries/3605385
- **Payment Due:** https://dune.com/queries/3630322
- **Payment Status:** https://dune.com/queries/3742749

## Verified Contracts

- **Mainnet:** https://etherscan.io/address/0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a
- **Testnet:** https://sepolia.etherscan.io/address/0xF1436859a0F04A827b79F8c92736F6331ebB64A1

## Usage & Environment

This project has two primary functions - billing and drafting which can be run as described in the docker section below.

Both functions require the following common environment variables be set:

```sh
# Address of billing contract.
BILLING_CONTRACT_ADDRESS
# For communication with EVM node and transaction broadcasting.
RPC_URL
# Used to link users to transaction in block explorer.
SCAN_URL
```

as well as the following **secrets**

```sh
# Used for Dune Query execution.
DUNE_API_KEY
# Used to sign transactions executions on the billing contract.
BILLER_PRIVATE_KEY
# API Key for slack notifcations
SLACK_TOKEN
# Channel to post success results in slack.
SLACK_CHANNEL
```

### Billing

Can be executed by anyone listed as a "biller" on the MEVBlockerFeeTill contract linked above.
Requires two additional environment variables:

```sh
# Dune QueryId of Payments Due
BILLING_QUERY=3605385
# Dune QueryId of fee value.
FEE_QUERY=3605385
```

### Drafting

Technically both the draft and fine functions are restricted (by the contract) to `onlyOwner`, so in order to execute these, one will have to install the Zodiac Roles Module on the owner (Safe) account of the contract and give access to the `Biller Account`. Instructions to enable and configure the specific roles can be found below.

Assuming the roles are appropriately confugured this program requires the following additional environment variables:

```sh
# A 32-byte hex string associated to the configured zodiac roles.
ZODIAC_ROLE_KEY
# Dune Query ID for detecting unpaid bills.
PAYMENT_QUERY=3742749
# Minimum fine to charge for drafting (in ETH)
FINE_MIN=0.001
# Minimum account balance required to stay connected to the network. (in ETH)
BOND_THRESHOLD=10
# For accounts who are loosely linked to the bond provider account.
BOND_MAP="('0xa489faf6e337d997b8a23e2b6f3a8880b1b61e19', '0xfd39bc23d356a762cf80f60b7bc8d2a4b9bcfe67')"
```

Notes on:

1. `FINE_MIN`: The program dynamically computes the fine as the execution cost of drafting & fining, but always fines charges at least the `FINE_MIN`.
   If set to zero, the program will always use dynamically evaluated fines.
   The value of `FINE_MIN` changes the way that participants might "play the game".
   For example, If the fine is 25$, users would be more inclined to pay their own bills, but at gas costs they might just top up their balances once a year and let this program draft them.

2. `BOND_THRESHOLD`: This is the balance that must be held by the user inside the contract to remain connected to the transaction flow. Currently the default is 10 ETH.

3. `BOND_MAP`: There is currently only one participant who has a "redirected" billing address. That is the account billed is different than the account who provided the bond and who pays the bills.

#### Installing Zodiac Roles Module

1. Navigate to the [Apps section of the Owner Safe](https://app.safe.global/apps?safe=eth:0x76F7a89C1eb4502b911CF58f7Aa7c2A1dA844F80)
2. Find the Zodiac Module (appUrl=https://zodiac.gnosisguild.org/)
3. [Requires Safe Transaction] Add the _Roles Modifier_ Module.
   Here is a [sample sepolia transaction](https://app.safe.global/transactions/tx?safe=sep:0x968b9bDba3816D39445fbb13de3FfA439f85270d&id=multisig_0x968b9bDba3816D39445fbb13de3FfA439f85270d_0xd4c42c9661c50da60d31f91637e4e75707b96a1f48402528708917f104d3c361)
4. [Requires Safe Transaction] Define the role that can execute both `draft` and `fine` on the `MevBlockerTill`contract.
   For this you can use [cowanator's fork](https://github.com/cowanator/safe-roles/pull/1) of the safe-roles CLI tool.
   Instructions are in the linked pull request of [@cowanator](https://github.com/cowanator)'s fork.
   Running `yarn apply mb-draft eth:0x76F7a89C1eb4502b911CF58f7Aa7c2A1dA844F80` there will redirect you back to the safe roles.
   Here is a [sample sepolia transaction](https://app.safe.global/transactions/tx?safe=sep:0x968b9bDba3816D39445fbb13de3FfA439f85270d&id=multisig_0x968b9bDba3816D39445fbb13de3FfA439f85270d_0xc612d0ad8de1e1da889f546dedb1fe26bc13e071fcfcf693cbef8c91aab9ee69)
5. [Requires Safe Transaction] **Assign Roles** Add the EOA account you would like to execute the `draft` and `fine` function.
   This can be done from within the safe Zodiac app.
   This project's test suite used the biller account for this purpose (so that only one key needs to )
   Here is a [sample seplolia transaction](https://app.safe.global/transactions/tx?safe=sep:0x968b9bDba3816D39445fbb13de3FfA439f85270d&id=multisig_0x968b9bDba3816D39445fbb13de3FfA439f85270d_0x3deba2b8af1b3a51d628af094eab5b79bba4b45848e0527a7d19e092062669da)
6. Celebrate - You just installed and configured a Zodiac Role Modifier!

## Local Development: Install, Set ENV & Run

```sh
# Install
yarn
# Copy and fill environment variables
cp .env.sample .env
```

Some values are filled, but others require secrets (`DUNE_API_KEY`, `BILLER_PRIVATE_KEY` for billing and `ZODIAC_ROLE_KEY` for drafting).

Run the Script:

```sh
# Billing: Requires `BILLER_PRIVATE_KEY`
yarn main billing
# Drafting: Requires `BILLER_PRIVATE_KEY` & `ZODIAC_ROLE_KEY`
yarn main drafting
```

## Docker

**Build**

```sh
docker build -t mb-billing .
```

where `PROGRAM` is one of {billing, drafting}.

**Run**

```sh
# Local:
docker run --rm --env-file .env mb-billing $PROGRAM
# Published Image:
docker run --rm --env-file .env ghcr.io/cowdao-grants/mb-billing:main $PROGRAM
```

where `PROGRAM` is one of {billing, drafting}.
