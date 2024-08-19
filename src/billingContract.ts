import { ethers, formatEther } from "ethers";
import {
  BillingData,
  DraftResults,
  LatestBillingStatus,
  PaymentStatus,
} from "./types";
import { BILLING_CONTRACT_ABI, ROLE_MODIFIER_ABI } from "./abis";
import { getTxCostForGas, maxBigInt } from "./gas";
import { MetaTransaction, encodeMulti } from "ethers-multisend";

interface BillingInput {
  addresses: `0x${string}`[];
  due: bigint[];
  newPrice: bigint;
}

export class BillingContract {
  readonly provider: ethers.JsonRpcProvider;
  readonly contract: ethers.Contract;
  readonly roleData?: {
    contract: ethers.Contract;
    key: string;
  };
  fineRecipient: ethers.AddressLike;
  minFine: bigint;

  constructor(
    address: string,
    provider: ethers.JsonRpcProvider,
    signer: ethers.Wallet,
    fineAmount: bigint,
    roleData?: {
      roleAddress: string;
      roleKey: string;
    },
  ) {
    this.provider = provider;
    this.contract = new ethers.Contract(address, BILLING_CONTRACT_ABI, signer);
    this.fineRecipient = signer.address;
    if (roleData) {
      this.roleData = {
        contract: new ethers.Contract(
          roleData.roleAddress,
          ROLE_MODIFIER_ABI,
          signer,
        ),
        key: roleData.roleKey,
      };
    }
    this.minFine = fineAmount;
  }

  static fromEnv(): BillingContract {
    const {
      RPC_URL,
      BILLER_PRIVATE_KEY,
      BILLING_CONTRACT_ADDRESS,
      ZODIAC_ROLES_MOD,
      ZODIAC_ROLE_KEY,
      FINE_MIN,
    } = process.env;
    const provider = new ethers.JsonRpcProvider(RPC_URL!);
    const signer = new ethers.Wallet(BILLER_PRIVATE_KEY!, provider);
    const minFine = FINE_MIN ? ethers.parseEther(FINE_MIN) : 0n;
    if (!BILLING_CONTRACT_ADDRESS) {
      throw new Error("Missing env var BILLING_CONTRACT_ADDRESS");
    }
    let roleData;
    if (ZODIAC_ROLE_KEY && ZODIAC_ROLES_MOD) {
      roleData = {
        roleAddress: ZODIAC_ROLES_MOD,
        roleKey: ZODIAC_ROLE_KEY,
      };
    }
    return new BillingContract(
      BILLING_CONTRACT_ADDRESS,
      provider,
      signer,
      minFine,
      roleData,
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
  ): Promise<DraftResults | undefined> {
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
    let draftedAccounts: `0x${string}`[] = [];
    let drafts: MetaTransaction[] = [];
    let fines: MetaTransaction[] = [];
    if (unpaidRecords.length > 0 && this.roleData) {
      for (const rec of unpaidRecords) {
        console.log(`Attaching Draft for ${rec.account}...`);
        drafts.push(
          await this.buildDraft(rec.account, rec.billedAmount - rec.paidAmount),
        );
        draftedAccounts.push(rec.account);
      }
      const fineAmount = await this.evaluateFine(drafts);
      for (const rec of unpaidRecords) {
        console.log(`Attaching Fine for ${rec.account}...`);
        fines.push(
          await this.buildFine(rec.account, fineAmount, this.fineRecipient),
        );
      }
      console.log(`Executing ${drafts.length} drafts & fines`);
      const tx = await this.execWithRole([...drafts, ...fines]);
      await tx.wait();
      return {
        txHash: tx.hash as `0x${string}`,
        accounts: draftedAccounts,
      };
    } else if (!this.roleData) {
      console.log("Not executing drafts because no role configured");
    } else {
      console.log("No Drafts to execute!");
    }
    return;
  }

  async getBond(account: `0x${string}`): Promise<bigint> {
    return this.contract.bonds(account);
  }

  async evaluateFine(drafts: MetaTransaction[]): Promise<bigint> {
    if (!this.roleData) {
      throw new Error(
        "Cannot estimate gas penalty for `fine` without configured role module",
      );
    }

    const metaTx = drafts.length > 1 ? encodeMulti(drafts) : drafts[0];
    const gasEstimate =
      await this.roleData.contract.execTransactionWithRole.estimateGas(
        metaTx.to,
        metaTx.value,
        metaTx.data,
        metaTx.operation,
        this.roleData.key,
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
      value: "0",
      operation: 0,
    };
  }

  async draft(account: `0x${string}`, amount: bigint): Promise<string> {
    try {
      let tx = await this.execWithRole([
        await this.buildDraft(account, amount),
      ]);
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
      value: "0",
      operation: 0,
    };
  }

  async fine(
    account: `0x${string}`,
    amount: bigint,
    feeRecipient: `0x${string}`,
  ): Promise<string> {
    try {
      const tx = await this.execWithRole([
        await this.buildFine(account, amount, feeRecipient),
      ]);
      await tx.wait();
      return tx.hash;
    } catch (error) {
      console.error("Fine Transaction failed:", error);
      throw error;
    }
  }

  async execWithRole(
    metaTransactions: MetaTransaction[],
  ): Promise<ethers.ContractTransactionResponse> {
    if (metaTransactions.length === 0) {
      throw new Error("No transactions to execute");
    }
    if (!this.roleData) {
      throw new Error(
        "Cannot execute transaction without configured role module",
      );
    }

    // Combine transactions into one.
    const metaTx =
      metaTransactions.length === 1
        ? metaTransactions[0]
        : encodeMulti(metaTransactions);
    return this.roleData.contract.execTransactionWithRole(
      metaTx.to,
      metaTx.value,
      metaTx.data,
      metaTx.operation,
      this.roleData.key,
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
