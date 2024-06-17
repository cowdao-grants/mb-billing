import { ethers } from "ethers";

export async function getTxCostForGas(
  provider: ethers.JsonRpcProvider,
  gasEstimate: bigint,
): Promise<bigint> {
  const [{ maxPriorityFeePerGas, maxFeePerGas }, latestBlock] =
    await Promise.all([provider.getFeeData(), provider.getBlock("latest")]);
  if (!maxPriorityFeePerGas || !maxFeePerGas) {
    throw new Error("no gas fee data");
  }
  const baseFeePerGas = latestBlock!.baseFeePerGas;
  if (!baseFeePerGas) {
    throw new Error("No base fee data");
  }
  const effectiveGasPrice = minBigInt(
    baseFeePerGas + maxPriorityFeePerGas,
    maxFeePerGas,
  );

  return gasEstimate * effectiveGasPrice;
}

export function minBigInt(a: bigint, b: bigint): bigint {
  if (a < b) {
    return a;
  }
  return b;
}

export function maxBigInt(a: bigint, b: bigint): bigint {
  if (a > b) {
    return a;
  }
  return b;
}
