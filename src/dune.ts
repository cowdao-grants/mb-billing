import {
  DuneClient,
  QueryEngine,
  Options,
  QueryParameter,
} from "@duneanalytics/client-sdk";
import { AmountDue, BillingData } from "./types";
import moment from "moment";

interface RuntimeOptions {
  performance?: QueryEngine;
  opts?: Options;
}

export class QueryRunner {
  private dune: DuneClient;
  private readonly paymentQuery: number;
  private readonly feeQuery: number;
  private readonly options: RuntimeOptions;

  constructor(
    apiKey: string,
    paymentQuery: number,
    feeQuery: number,
    options?: RuntimeOptions,
  ) {
    this.dune = new DuneClient(apiKey);
    this.paymentQuery = paymentQuery;
    this.feeQuery = feeQuery;
    this.options = options || {};
  }

  static fromEnv(): QueryRunner {
    const { FEE_QUERY, PAYMENT_QUERY, DUNE_API_KEY } = process.env;
    // TODO - make this configurable.
    const options = {
      // It is safer to run on medium in case the API key being used is not a PLUS account
      performance: QueryEngine.Large,
      // These queries take a long time to run.
      opts: { pingFrequency: 30 },
    };
    return new QueryRunner(
      DUNE_API_KEY!,
      parseInt(PAYMENT_QUERY!),
      parseInt(FEE_QUERY!),
      options,
    );
  }

  private async getAmountsDue(date: string): Promise<AmountDue[]> {
    try {
      const paymentResponse = await this.dune.runQuery({
        query_parameters: [QueryParameter.date("bill_date", date)],
        queryId: this.paymentQuery,
        ...this.options,
      });
      const results = paymentResponse.result!.rows;
      console.log("Got Payment Due Results:", results);
      return results.map((row: any) => ({
        billingAddress: row.miner_biller_address!,
        dueAmountWei: BigInt(row.due_payment_wei!),
      }));
    } catch (error) {
      console.error("Error fetching payment data:", error);
      throw error; // Rethrow after logging or handle as needed
    }
  }

  private async getPeriodFee(date: string): Promise<bigint> {
    try {
      const paymentResponse = await this.dune.runQuery({
        query_parameters: [QueryParameter.date("bill_date", date)],
        queryId: this.feeQuery,
        ...this.options,
      });
      const results = paymentResponse.result!.rows;
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
      const dateString = moment(date).format("YYYY-MM-DD HH:mm:ss");
      console.log(`Executing fee and payment queries this may take a while...`);
      const [dueAmounts, periodFee] = await Promise.all([
        this.getAmountsDue(dateString),
        this.getPeriodFee(dateString),
      ]);
      return { dueAmounts, periodFee };
    } catch (error) {
      console.error("Failed to run queries:", error);
      throw error;
    }
  }
}
