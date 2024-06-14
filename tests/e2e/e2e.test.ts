import { ethers } from "ethers";
import { BillingContract } from "../../src/billingContract";
import { QueryRunner } from "../../src/dune";
import dotenv from "dotenv";

dotenv.config();

describe("e2e - Sepolia", () => {
  const { DUNE_API_KEY } = process.env;
  // This uses mock queries.
  const billingQuery = 3678623;
  const feeQuery = 3678625;
  const paymentQuery = 3781897;

  const bondMap =
    "('0xa489faf6e337d997b8a23e2b6f3a8880b1b61e19', '0xfd39bc23d356a762cf80f60b7bc8d2a4b9bcfe67')";
  const dataFetcher = new QueryRunner(
    DUNE_API_KEY!,
    billingQuery,
    paymentQuery,
    feeQuery,
    bondMap,
    {},
  );
  const billDate = new Date();
  // Requires RPC_URL, BILLER_PRIVATE_KEY
  const billingContract = BillingContract.fromEnv();

  it("Runs the billing flow with mainnet data on Sepolia billing contract", async () => {
    const billingData = await dataFetcher.getBillingData(billDate);

    const txHash = await billingContract.updatePaymentDetails(billingData);
    // Retrieve and validate event logs.
    const provider = billingContract.contract.runner!.provider;
    const receipt = await provider!.getTransactionReceipt(txHash);
    const logs = receipt?.logs;
    expect(logs!.length).toEqual(3);
  });

  it("Runs the drafting flow with mainnet data on Sepolia billing contract", async () => {
    const paymentStatus = await dataFetcher.getPaymentStatus();
    const billingContract = BillingContract.fromEnv();
    const draftHash =
      await billingContract.processPaymentStatuses(paymentStatus);
    // This is a non-deterministic test.
    console.log("Drafting Hashes", draftHash);

    const provider = billingContract.contract.runner!.provider;
    const receipt = await provider!.getTransactionReceipt(draftHash);
    // 2 drafts + 2 fines + 2 safe module transactions.
    const expectedLogs = 1 + 2 + 2 + 1;
    expect(receipt?.logs!.length).toEqual(expectedLogs);
  });

  it.skip("e2e: successfully calls bill on BillingContract (with mock billing data)", async () => {
    const billingData = {
      dueAmounts: [
        {
          billingAddress: ethers.ZeroAddress as `0x${string}`,
          dueAmountWei: 1n,
        },
      ],
      periodFee: 99999999999999999n,
    };

    await expect(
      billingContract.updatePaymentDetails(billingData),
    ).resolves.not.toThrow();
  });

  it.skip("Dune: fetches billing data", async () => {
    const result = await dataFetcher.getBillingData(billDate);
    expect(result).toEqual({
      dueAmounts: [
        {
          billingAddress: "0xa9b8fbbf0d245471ec2a9d027cebc059034e49a5",
          dueAmountWei: 6624693748468070n,
        },
        {
          billingAddress: "0xcf7c69c7acf62179d29fa3f47de62226b58ad992",
          dueAmountWei: 9476323284740463000n,
        },
      ],
      periodFee: 602244886224370n,
    });
  });
});
