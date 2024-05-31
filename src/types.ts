export interface AmountDue {
  billingAddress: `0x${string}`;
  dueAmountWei: bigint;
}

export interface BillingData {
  dueAmounts: AmountDue[];
  periodFee: bigint;
}

export enum PaymentStatus {
  PAID = "PAID",
  UNPAID = "UNPAID",
  OVERPAID = "OVERPAID",
}

// Function to convert string to PaymentStatus enum
export function paymentStatusFromString(status: string): PaymentStatus {
  switch (status.toUpperCase()) {
    case "PAID":
      return PaymentStatus.PAID;
    case "UNPAID":
      return PaymentStatus.UNPAID;
    case "OVERPAID":
      return PaymentStatus.OVERPAID;
    default:
      throw new Error(`Invalid Payment Status ${status}`);
  }
}

export interface LatestBillingStatus {
  account: `0x${string}`;
  billedAmount: bigint;
  paidAmount: bigint;
  status: PaymentStatus;
}
