import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import { PaymentStatus } from "./types";
import { ethers, formatEther } from "ethers";

export class AccountManager {
  private dataFetcher: QueryRunner;
  private billingContract: BillingContract;

  constructor(dataFetcher: QueryRunner, billingContract: BillingContract) {
    this.dataFetcher = dataFetcher;
    this.billingContract = billingContract;
  }

  static fromEnv(): AccountManager {
    return new AccountManager(QueryRunner.fromEnv(), BillingContract.fromEnv());
  }

  async runBilling() {
    const today = todaysDate();
    console.log("Running Biller for Date", today);
    const billingResults = await this.dataFetcher.getBillingData(today);
    // TODO - validate results!
    await this.billingContract.updatePaymentDetails(billingResults);
  }

  async runDrafting() {
    console.log("Running Drafter");
    const paymentStatuses = await this.dataFetcher.getPaymentStatus();
    await this.billingContract.processPaymentStatuses(paymentStatuses);
  }
}

function todaysDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
