import { ethers, formatEther } from "ethers";
import { BillingData, LatestBillingStatus, PaymentStatus } from "./types";
import { BILLING_CONTRACT_ABI, ROLE_MODIFIER_ABI } from "./abis";
import { MetaTransaction, encodeMulti } from "./multisend";
import { getTxCostForGas, maxBigInt } from "./gas";

interface BillingInput {
  addresses: `0x${string}`[];
  due: bigint[];
  newPrice: bigint;
}

export class BillingContract {
  readonly provider: ethers.JsonRpcProvider;
  readonly contract: ethers.Contract;
  readonly roleContract: ethers.Contract;
  private roleKey?: string;
  fineRecipient: ethers.AddressLike;
  minFine: bigint;

  constructor(
    address: string,
    provider: ethers.JsonRpcProvider,
    signer: ethers.Wallet,
    fineAmount: bigint,
    roleKey?: string,
  ) {
    this.provider = provider;
    this.contract = new ethers.Contract(address, BILLING_CONTRACT_ABI, signer);
    this.roleContract = new ethers.Contract(
      "0xa2f93c12E697ABC34770CFAB2def5532043E26e9",
      ROLE_MODIFIER_ABI,
      signer,
    );
    this.fineRecipient = signer.address;
    this.roleKey = roleKey;
    if (!roleKey) {
      console.warn(
        `No ROLE_KEY provided, executing transactions as ${signer.address}`,
      );
    }
    this.minFine = fineAmount;
  }

  static fromEnv(): BillingContract {
    const {
      RPC_URL,
      BILLER_PRIVATE_KEY,
      BILLING_CONTRACT_ADDRESS,
      ROLE_KEY,
      FINE_MIN,
    } = process.env;
    const provider = new ethers.JsonRpcProvider(RPC_URL!);
    const signer = new ethers.Wallet(BILLER_PRIVATE_KEY!, provider);
    const minFine = FINE_MIN ? ethers.parseEther(FINE_MIN) : 0n;
    return new BillingContract(
      BILLING_CONTRACT_ADDRESS!,
      provider,
      signer,
      minFine,
      ROLE_KEY,
    );
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
  ): Promise<string | undefined> {
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
    let drafts: MetaTransaction[] = [];
    let fines: MetaTransaction[] = [];
    if (unpaidRecords.length > 0) {
      for (const rec of unpaidRecords) {
        console.log(`Attaching Draft for ${rec.account}...`);
        drafts.push(
          await this.buildDraft(rec.account, rec.billedAmount - rec.paidAmount),
        );
      }
      const fineAmount = await this.evaluateFine(drafts);
      for (const rec of unpaidRecords) {
        console.log(`Attaching Fine for ${rec.account}...`);
        fines.push(
          await this.buildFine(rec.account, fineAmount, this.fineRecipient),
        );
      }
      console.log(`Executing ${drafts.length} drafts & fines`);
      const tx = await this.execWithRole([...drafts, ...fines], this.roleKey!);
      await tx.wait();
      return tx.hash;
    } else {
      console.log("No Drafts to execute!");
    }
    return;
  }

  async evaluateFine(drafts: MetaTransaction[]): Promise<bigint> {
    const metaTx = drafts.length > 1 ? encodeMulti(drafts) : drafts[0];
    const gasEstimate =
      await this.roleContract.execTransactionWithRole.estimateGas(
        metaTx.to,
        metaTx.value,
        metaTx.data,
        metaTx.operation,
        this.roleKey,
        true, // shouldRevert
      );
    const txCost = await getTxCostForGas(this.provider, gasEstimate);
    // Larger of minFine and estimated txCost per account (2x because of Draft + Fine)
    // So if the fine tx is more expensive than minFine we charge that.
    const fineAmount = maxBigInt(
      (txCost * 2n) / BigInt(drafts.length),
      this.minFine,
    );
    console.log("Fine Amount:", fineAmount);
    return fineAmount;
  }

  async buildDraft(
    account: `0x${string}`,
    amount: bigint,
  ): Promise<MetaTransaction> {
    return {
      to: await this.contract.getAddress(),
      data: this.contract.interface.encodeFunctionData("draft", [
        account,
        amount,
      ]),
      value: 0,
      operation: 0,
    };
  }

  async draft(account: `0x${string}`, amount: bigint): Promise<string> {
    try {
      let tx: ethers.ContractTransactionResponse;
      if (this.roleKey) {
        tx = await this.execWithRole(
          [await this.buildDraft(account, amount)],
          this.roleKey,
        );
      } else {
        tx = await this.contract.draft(account, amount);
      }
      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error("Draft Transaction failed:", error);
      throw error;
    }
  }

  async buildFine(
    account: ethers.AddressLike,
    amount: bigint,
    feeRecipient: ethers.AddressLike,
  ): Promise<MetaTransaction> {
    return {
      to: await this.contract.getAddress(),
      data: this.contract.interface.encodeFunctionData("fine", [
        account,
        amount,
        feeRecipient,
      ]),
      value: 0,
      operation: 0,
    };
  }

  async fine(
    account: `0x${string}`,
    amount: bigint,
    feeRecipient: `0x${string}`,
  ): Promise<string> {
    try {
      let tx: ethers.ContractTransactionResponse;
      if (this.roleKey) {
        tx = await this.execWithRole(
          [await this.buildFine(account, amount, feeRecipient)],
          this.roleKey,
        );
      } else {
        tx = await this.contract.fine(account, amount, feeRecipient);
      }
      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error("Fine Transaction failed:", error);
      throw error;
    }
  }

  async execWithRole(
    metaTransactions: MetaTransaction[],
    roleKey: string,
  ): Promise<ethers.ContractTransactionResponse> {
    if (metaTransactions.length === 0)
      throw new Error("No transactions to execute");

    // Combine transactions into one.
    const metaTx =
      metaTransactions.length === 1
        ? metaTransactions[0]
        : encodeMulti(metaTransactions);
    return this.roleContract.execTransactionWithRole(
      metaTx.to,
      metaTx.value,
      metaTx.data,
      metaTx.operation,
      roleKey,
      true, // shouldRevert
    );
  }
}

export function transformBillingData(billingData: BillingData): BillingInput {
  return {
    addresses: billingData.dueAmounts.map((v) => v.billingAddress),
    due: billingData.dueAmounts.map((v) => v.dueAmountWei),
    newPrice: billingData.periodFee,
  };
}
