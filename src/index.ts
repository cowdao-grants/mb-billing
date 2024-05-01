import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import log from "loglevel";

log.setLevel("debug");

async function main() {
  const dataFetcher = QueryRunner.fromEnv();
  const billingResults = await dataFetcher.getBillingData();
  // TODO - validate results!
  const billingContract = BillingContract.fromEnv();
  await billingContract.updatePaymentDetails(billingResults);
}

main().then((r) => console.log("All done!"));
