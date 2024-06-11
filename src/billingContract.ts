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

const ROLE_MODIFIER_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "value",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "data",
        type: "bytes",
      },
      {
        internalType: "enum Enum.Operation",
        name: "operation",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "roleKey",
        type: "bytes32",
      },
      {
        internalType: "bool",
        name: "shouldRevert",
        type: "bool",
      },
    ],
    name: "execTransactionWithRole",
    outputs: [
      {
        internalType: "bool",
        name: "success",
        type: "bool",
      },
    ],
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
  readonly roleContract: ethers.Contract;
  private roleKey: string;

  constructor(address: string, signer: ethers.Wallet, roleKey: string) {
    this.contract = new ethers.Contract(address, BILLING_CONTRACT_ABI, signer);
    this.roleContract = new ethers.Contract(
      "0xa2f93c12E697ABC34770CFAB2def5532043E26e9",
      ROLE_MODIFIER_ABI,
      signer,
    );
    this.roleKey = roleKey;
  }

  static fromEnv(): BillingContract {
    const { RPC_URL, BILLER_PRIVATE_KEY, BILLING_CONTRACT_ADDRESS, ROLE_KEY } =
      process.env;
    const provider = new ethers.JsonRpcProvider(RPC_URL!);
    const signer = new ethers.Wallet(BILLER_PRIVATE_KEY!, provider);
    return new BillingContract(BILLING_CONTRACT_ADDRESS!, signer, ROLE_KEY!);
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
      const txHash = await this.draftWithRole(
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

  async draftWithRole(account: `0x${string}`, amount: bigint): Promise<string> {
    try {
      const functionCallData = this.contract.interface.encodeFunctionData(
        "draft",
        [account, amount],
      );
      const tx: ethers.ContractTransactionResponse =
        await this.roleContract.execTransactionWithRole(
          this.contract.getAddress(), // to
          0, // value
          functionCallData, // data
          0, // operation
          this.roleKey, // roleKey
          true, // shouldRevert
        );
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
