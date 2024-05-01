import log from "loglevel";

log.setLevel("debug");

async function main() {
  console.log("Hello, project!");
}

main().then((r) => console.log("All done!"));
