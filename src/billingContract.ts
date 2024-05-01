import { TransactionReceipt, ethers } from "ethers";
import { BillingData } from "./types";

const BILLING_CONTRACT_ABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "ids",
        type: "address[]",
      },
      {
        internalType: "uint256[]",
        name: "due",
        type: "uint256[]",
      },
      {
        internalType: "uint256",
        name: "newPrice",
        type: "uint256",
      },
    ],
    name: "bill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

interface BillingInput {
  addresses: `0x${string}`[];
  due: bigint[];
  newPrice: bigint;
}

export class BillingContract {
  readonly contract: ethers.Contract;

  constructor(address: string, signer: ethers.Wallet) {
    this.contract = new ethers.Contract(address, BILLING_CONTRACT_ABI, signer);
  }

  static fromEnv(): BillingContract {
    const { RPC_URL, BILLER_PRIVATE_KEY, BILLING_CONTRACT_ADDRESS } =
      process.env;
    const provider = new ethers.JsonRpcProvider(RPC_URL!);
    const signer = new ethers.Wallet(BILLER_PRIVATE_KEY!, provider);
    return new BillingContract(BILLING_CONTRACT_ADDRESS!, signer);
  }

  async updatePaymentDetails(
    billingData: BillingData,
  ): Promise<TransactionReceipt> {
    try {
      const { addresses, due, newPrice } = transformBillingData(billingData);
      const tx = await this.contract.bill(addresses, due, newPrice);
      await tx.wait();
      console.log("Transaction successful:", tx);
      return tx.hash;
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  }
}

export function transformBillingData(billingData: BillingData): BillingInput {
  return {
    addresses: billingData.dueAmounts.map((v) => v.billingAddress),
    due: billingData.dueAmounts.map((v) => v.dueAmountWei),
    newPrice: billingData.periodFee,
  };
}
