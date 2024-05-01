interface NetworkFields {
  billingContract: `0x${string}`;
  rpcUrl: string;
}

type NetworkMap = { [key: string]: NetworkFields };

export const NETWORK_MAP: NetworkMap = {
  ["mainnet"]: {
    billingContract: "0x08Cd77fEB3fB28CC1606A91E0Ea2f5e3EABa1A9a",
    rpcUrl: "https://rpc.ankr.com/eth",
  },
  ["testnet"]: {
    billingContract: "0x2ad5fcddf209ca9e01509ecfa77115d3a9f999fa",
    rpcUrl: "https://rpc.sepolia.org",
  },
};
