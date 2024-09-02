import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import { Slack } from "./notify";
import { ethers } from "ethers";
import { DraftResults, LatestBillingStatus, PaymentStatus } from "./types";

const TEN_ETH = ethers.parseEther("1");

export class AccountManager {
  private dataFetcher: QueryRunner;
  private billingContract: BillingContract;
  private slack: Slack;
  scanUrl?: string;
  bondThreshold: bigint;

  constructor(
    dataFetcher: QueryRunner,
    billingContract: BillingContract,
    slack: Slack,
    bondThreshold: bigint = TEN_ETH,
    scanUrl?: string,
  ) {
    this.dataFetcher = dataFetcher;
    this.billingContract = billingContract;
    this.slack = slack;
    if (!scanUrl) {
      console.warn("running without scan URL, txHashes will be logged bare");
    }
    this.scanUrl = scanUrl;
    this.bondThreshold = bondThreshold;
  }

  static async fromEnv(): Promise<AccountManager> {
    const { BOND_THRESHOLD, SCAN_URL } = process.env;
    const bondThreshold = BOND_THRESHOLD
      ? ethers.parseEther(BOND_THRESHOLD)
      : TEN_ETH;
    return new AccountManager(
      QueryRunner.fromEnv(),
      BillingContract.fromEnv(),
      await Slack.fromEnv(),
      bondThreshold,
      SCAN_URL,
    );
  }

  async runBilling() {
    const today = todaysDate();
    console.log("Running Biller for Date", today);
    const billingResults = await this.dataFetcher.getBillingData(today);
    const txHash =
      await this.billingContract.updatePaymentDetails(billingResults);

    let messages = [`MEV Billing ran successfully: ${this.txLink(txHash)}`];
    for (const amountDue of billingResults.dueAmounts) {
      messages.push(
        `${amountDue.builder} was billed ${ethers.formatEther(
          amountDue.dueAmountWei,
        )} ETH`,
      );
    }
    await this.slack.post(messages.join("\n"));
  }

  async runDrafting() {
    console.log("Running Drafter");
    const paymentStatuses = await this.dataFetcher.getPaymentStatus();
    await this.paymentStatusPost(paymentStatuses);
    const draftResults =
      await this.billingContract.processPaymentStatuses(paymentStatuses);
    if (draftResults) {
      await this.draftPost(draftResults);
    } else {
      console.log("No accounts drafted");
    }
  }

  async paymentStatusPost(
    paymentStatuses: LatestBillingStatus[],
  ): Promise<void> {
    let messages = ["MEVBlocker builder payment status update:"];
    for (let paymentStatus of paymentStatuses) {
      if (paymentStatus.status !== PaymentStatus.PAID) {
        messages.push(
          `${paymentStatus.account} was supposed to pay ${ethers.formatEther(paymentStatus.billedAmount)} ETH but paid ${ethers.formatEther(paymentStatus.paidAmount)} ETH`,
        );
      }
    }
    if (messages.length == 1) {
      messages.push("All builders paid");
    }
    await this.slack.post(messages.join("\n"));
  }

  async draftPost(draftResults: DraftResults): Promise<void> {
    const { txHash, accounts } = draftResults;
    let messages: string[] = [
      `MEV Drafting ran successfully: ${this.txLink(txHash)}`,
    ];

    for (const address of accounts) {
      try {
        const remainingBond = await this.billingContract.getBond(address);
        if (remainingBond < this.bondThreshold) {
          messages.push(
            `Account ${address} bond (${ethers.formatEther(remainingBond)} ETH) below threshold!`,
          );
        }
      } catch (error) {
        messages.push(`Error reading bond value for ${address}: ${error}`);
      }
    }
    await this.slack.post(messages.join("\n"));
  }

  private txLink(hash: string): string {
    return `${this.scanUrl}/tx/${hash}`;
  }
}

function todaysDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
