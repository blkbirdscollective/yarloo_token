import { TypedDataUtils } from "eth-sig-util";

export const EIP712Domain = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

export async function domainSeparator(name: string, version: string, chainId: number, verifyingContract: string): Promise<string> {
  return "0x" + TypedDataUtils.hashStruct("EIP712Domain", { name, version, chainId, verifyingContract }, { EIP712Domain }).toString("hex");
}
