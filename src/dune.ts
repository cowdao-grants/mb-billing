import {
  DuneClient,
  ExecutionPerformance,
  Options,
} from "@duneanalytics/client-sdk";
import { AmountDue, BillingData } from "./types";

interface RuntimeOptions {
  performance?: ExecutionPerformance;
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
      performance: ExecutionPerformance.Large,
      opts: { pingFrequency: 30 },
    };
    return new QueryRunner(
      DUNE_API_KEY!,
      parseInt(PAYMENT_QUERY!),
      parseInt(FEE_QUERY!),
      options,
    );
  }

  private async getAmountsDue(): Promise<AmountDue[]> {
    try {
      const paymentResponse = await this.dune.runQuery({
        queryId: this.paymentQuery,
        ...this.options,
      });
      const results = paymentResponse.result!.rows;

      return results.map((row: any) => ({
        billingAddress: row.miner_biller_address!,
        dueAmountWei: BigInt(row.due_payment_wei!),
      }));
    } catch (error) {
      console.error("Error fetching payment data:", error);
      throw error; // Rethrow after logging or handle as needed
    }
  }

  private async getPeriodFee(): Promise<bigint> {
    try {
      const paymentResponse = await this.dune.runQuery({
        queryId: this.feeQuery,
        ...this.options,
      });
      const results = paymentResponse.result!.rows;
      if (results.length > 1) {
        throw new Error(`Unexpected number of records ${results.length} != 1`);
      }
      const result = results[0].avg_block_fee_wei as string;
      return BigInt(result);
    } catch (error) {
      console.error("Error fetching fee data:", error);
      throw error; // Rethrow after logging or handle as needed
    }
  }

  async getBillingData(): Promise<BillingData> {
    try {
      console.log(`Executing fee and payment queries this may take a while...`);
      const [dueAmounts, periodFee] = await Promise.all([
        this.getAmountsDue(),
        this.getPeriodFee(),
      ]);
      return { dueAmounts, periodFee };
    } catch (error) {
      console.error("Failed to run queries:", error);
      throw error;
    }
  }
}
