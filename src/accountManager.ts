import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import { Slack } from "./notify";

export class AccountManager {
  private dataFetcher: QueryRunner;
  private billingContract: BillingContract;
  private slack: Slack;
  scanUrl?: string;

  constructor(
    dataFetcher: QueryRunner,
    billingContract: BillingContract,
    slack: Slack,
    scanUrl?: string,
  ) {
    this.dataFetcher = dataFetcher;
    this.billingContract = billingContract;
    this.slack = slack;
    if (!scanUrl) {
      console.warn("running without scan URL, txHashes will be logged bare");
    }
    this.scanUrl = scanUrl;
  }

  static async fromEnv(): Promise<AccountManager> {
    return new AccountManager(
      QueryRunner.fromEnv(),
      BillingContract.fromEnv(),
      await Slack.fromEnv(),
    );
  }

  async runBilling() {
    const today = todaysDate();
    console.log("Running Biller for Date", today);
    const billingResults = await this.dataFetcher.getBillingData(today);
    // TODO - validate results!
    const txHash =
      await this.billingContract.updatePaymentDetails(billingResults);
    await this.slack.post(
      `MEV Billing ran successfully: ${this.txLink(txHash)}`,
    );
  }

  async runDrafting() {
    console.log("Running Drafter");
    const paymentStatuses = await this.dataFetcher.getPaymentStatus();
    const txHash =
      await this.billingContract.processPaymentStatuses(paymentStatuses);
    if (txHash) {
      await this.slack.post(
        `MEV Drafting ran successfully: ${this.txLink(txHash)}`,
      );
    } else {
      console.log("No accounts drafted");
    }
    // TODO - check balances after drafting and notify if too low!
    // May only need to query balances of those who were drafted.
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
