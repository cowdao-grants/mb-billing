import dotenv from "dotenv";
import log from "loglevel";
import { AccountManager } from "./accountManager";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Slack } from "./notify";

log.setLevel("info");
dotenv.config();

async function main() {
  const args = await yargs(hideBin(process.argv))
    .command("billing", "Run billing process")
    .command("drafting", "Run drafting process")
    .demandCommand(1, "You need to specify a command: billing or drafting")
    .help().argv;

  const manager = await AccountManager.fromEnv();

  if (args._.includes("billing")) {
    await manager.runBilling();
  } else if (args._.includes("drafting")) {
    await manager.runDrafting();
  } else {
    log.error("Invalid command. Use --help for usage information.");
  }
}

main().then(() => console.log("All done!"));
