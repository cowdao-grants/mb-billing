import { ethers, formatEther } from "ethers";
import { BillingData, LatestBillingStatus, PaymentStatus } from "./types";

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
  {
    inputs: [
      {
        internalType: "address",
        name: "id",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amt",
        type: "uint256",
      },
    ],
    name: "draft",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "id",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amt",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "fine",
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

  static fromEnv(sudo: boolean = false): BillingContract {
    const {
      RPC_URL,
      BILLER_PRIVATE_KEY,
      OWNER_PRIVATE_KEY,
      BILLING_CONTRACT_ADDRESS,
    } = process.env;
    const provider = new ethers.JsonRpcProvider(RPC_URL!);
    let signer: ethers.Wallet;
    if (sudo) {
      signer = new ethers.Wallet(OWNER_PRIVATE_KEY!, provider);
    } else {
      signer = new ethers.Wallet(BILLER_PRIVATE_KEY!, provider);
    }
    return new BillingContract(BILLING_CONTRACT_ADDRESS!, signer);
  }

  async updatePaymentDetails(billingData: BillingData): Promise<string> {
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

  async processPaymentStatuses(
    paymentStatuses: LatestBillingStatus[],
  ): Promise<string[]> {
    const unpaidRecords = paymentStatuses.filter((record) => {
      const { account, status, paidAmount, billedAmount } = record;
      if (status == PaymentStatus.UNPAID) {
        const owing = billedAmount - paidAmount;
        console.info(`unpaid bill: ${account} owes ${formatEther(owing)} ETH`);
        return true;
      } else if (status == PaymentStatus.OVERPAID) {
        const over = paidAmount - billedAmount;
        console.warn(
          `overpaid bill: ${account} overpaid by ${formatEther(over)}`,
        );
        return false;
      }
      return false;
    });
    // These drafts must be processed sequentially
    // Otherwise the owner account nonce will not be incremented.
    const resultHashes = [];
    for (const rec of unpaidRecords) {
      console.log(`Executing draft for ${rec.account}...`);
      const txHash = await this.draft(
        rec.account,
        rec.billedAmount - rec.paidAmount,
      );
      resultHashes.push(txHash);
    }
    return resultHashes;
  }

  async draft(account: `0x${string}`, amount: bigint): Promise<string> {
    try {
      const tx = await this.contract.draft(account, amount);
      await tx.wait();
      console.log("Draft successful:", tx.hash);
      return tx.hash;
    } catch (error) {
      console.error("Draft Transaction failed:", error);
      throw error;
    }
  }

  async fine(
    account: `0x${string}`,
    amount: bigint,
    to: `0x${string}`,
  ): Promise<string> {
    try {
      const tx = await this.contract.fine(account, amount, to);
      await tx.wait();
      console.log("Fine Transaction successful:", tx);
      return tx.hash;
    } catch (error) {
      console.error("Fine Transaction failed:", error);
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
