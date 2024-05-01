import { QueryRunner } from "./dune";
import { BillingContract } from "./billingContract";
import log from "loglevel";

function todaysDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

log.setLevel("debug");

async function main() {
  const today = todaysDate();
  console.log("Running for Date", today);
  const dataFetcher = QueryRunner.fromEnv();
  const billingResults = await dataFetcher.getBillingData(today);
  // TODO - validate results!
  const billingContract = BillingContract.fromEnv();
  await billingContract.updatePaymentDetails(billingResults);
}

main().then(() => console.log("All done!"));
