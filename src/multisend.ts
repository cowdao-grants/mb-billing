import { ethers } from "ethers";
import { hexDataLength } from "@ethersproject/bytes";
import { MULTI_SEND_ABI } from "./abis";

export const MULTISEND_141 = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
const MULTISEND_CALLONLY_141 = "0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

export enum OperationType {
  Call = 0,
  DelegateCall = 1,
}

export interface MetaTransaction {
  /// A `uint8` with `0` for a `call` or `1` for a `delegatecall` (=> 1 byte),
  readonly operation?: OperationType;
  /// `to` as an `address` (=> 20 bytes),
  readonly to: string;
  /// ETH value of the transaction (uint256)
  readonly value: ethers.BigNumberish;
  /// Transaction call data (bytes)
  readonly data: string;
}

const remove0x = (hexString: string) => hexString.slice(2);

/**
 * Encodes the MetaTransaction as packed bytes
 */
export function encodeMetaTransaction(metaTx: MetaTransaction): string {
  const types = ["uint8", "address", "uint256", "uint256", "bytes"];
  const values = [
    // Default to CALL if operation is undefined
    metaTx.operation ?? OperationType.Call,
    metaTx.to,
    metaTx.value,
    hexDataLength(metaTx.data),
    metaTx.data,
  ];
  return ethers.solidityPacked(types, values);
}

export const encodeMulti = (
  transactions: readonly MetaTransaction[],
  multiSendContractAddress: string = transactions.some(
    (t) => t.operation && t.operation === OperationType.DelegateCall,
  )
    ? MULTISEND_141
    : MULTISEND_CALLONLY_141,
): MetaTransaction => {
  const transactionsEncoded =
    "0x" + transactions.map(encodeMetaTransaction).map(remove0x).join("");

  const multiSendContract = new ethers.Interface(MULTI_SEND_ABI);
  const data = multiSendContract.encodeFunctionData("multiSend", [
    transactionsEncoded,
  ]);

  return {
    operation: OperationType.DelegateCall,
    to: multiSendContractAddress,
    value: "0x00",
    data,
  };
};
