import { transformBillingData } from "../../src/billingContract";

export const MOCK_BILLING_DATA = {
  dueAmounts: [
    {
      billingAddress:
        "0x1111111111111111111111111111111111111111" as `0x${string}`,
      dueAmountWei: 11111111111111111111n,
    },
    {
      billingAddress:
        "0x2222222222222222222222222222222222222222" as `0x${string}`,
      dueAmountWei: 222222222222222222222n,
    },
  ],
  periodFee: 99999999999999999n,
};

describe("BillingContract & Related Utilities", () => {
  const billingData = MOCK_BILLING_DATA;

  it("transforms Billing Data to Contract Input", async () => {
    /// This is an equivalent but different implementation of transformBilling Data.
    /// We include it in the test as a possible alternative
    const { addresses, due } = billingData.dueAmounts.reduce<{
      addresses: `0x${string}`[];
      due: bigint[];
    }>(
      (acc, item) => {
        acc.addresses.push(item.billingAddress);
        acc.due.push(item.dueAmountWei);
        return acc;
      },
      { addresses: [], due: [] },
    );

    expect(transformBillingData(billingData)).toEqual({
      addresses,
      due,
      newPrice: billingData.periodFee,
    });
  });
});
