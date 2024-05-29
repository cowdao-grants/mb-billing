import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import { PaymentStatus } from "./types";
import { formatEther } from "ethers";

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
    paymentStatuses.map(async (record) => {
      const { account, status, paidAmount, billedAmount } = record;
      if (status == PaymentStatus.UNPAID) {
        const owing = billedAmount - paidAmount;
        console.info(`unpaid bill: ${account} owes ${formatEther(owing)} ETH`);
        await this.billingContract.draft(account, owing);
      } else if (status == PaymentStatus.OVERPAID) {
        const over = paidAmount - billedAmount;
        console.warn(
          `overpaid bill: ${account} overpaid by ${formatEther(over)}`,
        );
      }
    });
  }
}

function todaysDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
