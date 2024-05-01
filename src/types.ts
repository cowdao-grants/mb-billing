export interface AmountDue {
  billingAddress: `0x${string}`;
  dueAmountWei: bigint;
}

export interface BillingData {
  dueAmounts: AmountDue[];
  periodFee: bigint;
}
