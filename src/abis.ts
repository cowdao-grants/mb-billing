export const BILLING_CONTRACT_ABI = [
  "function bill(address[] ids, uint256[] due, uint256 newPrice)",
  "function draft(address id, uint256 amt)",
  "function fine(address id, uint256 amt, address to)",
];

export const ROLE_MODIFIER_ABI = [
  "function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool success)",
];

export const MULTI_SEND_ABI = ["function multiSend(bytes memory transactions)"];
