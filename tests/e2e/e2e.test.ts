import { ethers } from "ethers";
import { BillingContract } from "../../src/billingContract";
import { QueryRunner } from "../../src/dune";
import dotenv from "dotenv";

dotenv.config();

describe("e2e - Sepolia", () => {
  const { DUNE_API_KEY } = process.env;
  // This uses mock queries.
  const paymentQuery = 3678623;
  const feeQuery = 3678625;
  const dataFetcher = new QueryRunner(
    DUNE_API_KEY!,
    paymentQuery,
    feeQuery,
    {},
  );
  const billDate = new Date();
  // Requires RPC_URL, BILLER_PRIVATE_KEY
  const billingContract = BillingContract.fromEnv();

  it("Runs the full flow with mainnet data on Sepolia billing contract", async () => {
    const billingData = await dataFetcher.getBillingData(billDate);

    const txHash = await billingContract.updatePaymentDetails(billingData);
    // Retrieve and validate event logs.
    const provider = billingContract.contract.runner!.provider;
    const receipt = await provider!.getTransactionReceipt(txHash);
    const logs = receipt?.logs;
    expect(logs!.length).toEqual(1);
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
