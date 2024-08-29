import {
  DuneClient,
  QueryEngine,
  Options,
  QueryParameter,
} from "@duneanalytics/client-sdk";
import {
  AmountDue,
  BillingData,
  LatestBillingStatus,
  paymentStatusFromString,
} from "./types";
import moment from "moment";

interface RuntimeOptions {
  performance?: QueryEngine;
  opts?: Options;
}

export class QueryRunner {
  private dune: DuneClient;
  private readonly billingQuery: number;
  private readonly paymentQuery: number;
  private readonly feeQuery: number;
  private readonly options: RuntimeOptions;

  constructor(
    apiKey: string,
    billingQuery: number,
    paymentQuery: number,
    feeQuery: number,
    options?: RuntimeOptions,
  ) {
    this.dune = new DuneClient(apiKey);
    this.billingQuery = billingQuery;
    this.paymentQuery = paymentQuery;
    this.feeQuery = feeQuery;
    this.options = options || {};
  }

  static fromEnv(): QueryRunner {
    const { FEE_QUERY, BILLING_QUERY, PAYMENT_QUERY, DUNE_API_KEY } =
      process.env;
    // TODO - make this configurable.
    const options = {
      // It is safer to run on medium in case the API key being used is not a PLUS account
      performance: QueryEngine.Large,
      // These queries take a long time to run.
      opts: { pingFrequency: 30 },
    };
    return new QueryRunner(
      DUNE_API_KEY!,
      parseInt(BILLING_QUERY!),
      parseInt(PAYMENT_QUERY!),
      parseInt(FEE_QUERY!),
      options,
    );
  }

  private async getAmountsDue(
    billingDate: string,
    feeComputationStart: string,
    feeComputationEnd: string,
  ): Promise<AmountDue[]> {
    try {
      const billingResponse = await this.dune.runQuery({
        query_parameters: [
          QueryParameter.date("billing_date", billingDate),
          QueryParameter.date("fee_computation_start", feeComputationStart),
          QueryParameter.date("fee_computation_end", feeComputationEnd),
        ],
        queryId: this.billingQuery,
        ...this.options,
      });
      const results = billingResponse.result!.rows;
      console.log("Got Billing Results:", results);
      return results.map((row: any) => ({
        billingAddress: row.billing_address!,
        builder: row.label,
        dueAmountWei: BigInt(row.amount_due_wei!),
      }));
    } catch (error) {
      console.error("Error fetching payment data:", error);
      throw error; // Rethrow after logging or handle as needed
    }
  }

  private async getPeriodFee(start: string, end: string): Promise<bigint> {
    try {
      const feeResponse = await this.dune.runQuery({
        query_parameters: [
          QueryParameter.date("start", start),
          QueryParameter.date("end", end),
        ],
        queryId: this.feeQuery,
        ...this.options,
      });
      const results = feeResponse.result!.rows;
      if (results.length > 1) {
        throw new Error(`Unexpected number of records ${results.length} != 1`);
      }
      console.log("Period Fee Results:", results);
      const result = results[0].avg_block_fee_wei as string;
      return BigInt(result);
    } catch (error) {
      console.error("Error fetching fee data:", error);
      throw error; // Rethrow after logging or handle as needed
    }
  }

  async getBillingData(date: Date): Promise<BillingData> {
    try {
      const billingDate = moment(date).format("YYYY-MM-DD 00:00:00");
      const feeComputationStart = moment(date)
        .subtract(1, "month")
        .startOf("month")
        .format("YYYY-MM-DD 00:00:00");
      const feeComputationEnd = moment(date)
        .startOf("month")
        .format("YYYY-MM-DD 00:00:00");
      console.log(`Executing fee and payment queries this may take a while...`);
      const [dueAmounts, periodFee] = await Promise.all([
        this.getAmountsDue(billingDate, feeComputationStart, feeComputationEnd),
        this.getPeriodFee(feeComputationStart, feeComputationEnd),
      ]);
      return { dueAmounts, periodFee };
    } catch (error) {
      console.error("Failed to run queries:", error);
      throw error;
    }
  }

  async getPaymentStatus(): Promise<LatestBillingStatus[]> {
    try {
      console.log(`Retrieving latest payment status...`);
      const paymentResponse = await this.dune.runQuery({
        queryId: this.paymentQuery,
        ...this.options,
      });
      const results = paymentResponse.result!.rows;
      console.log("Got Payment Status Results:", results);
      return results.map((row: any) => ({
        account: row.usr!,
        billedAmount: BigInt(row.bill_amount!),
        paidAmount: BigInt(row.paid_amount!),
        status: paymentStatusFromString(row.status!),
      }));
    } catch (error) {
      console.error("Failed to payment query:", error);
      throw error;
    }
  }
}
