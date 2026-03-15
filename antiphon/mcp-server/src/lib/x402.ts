import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { RPC_URL } from "./contracts.js";

function getPaymentAccount() {
  const key = process.env.RACHAX402_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("RACHAX402_PRIVATE_KEY env var required for x402 payment signing");
  return privateKeyToAccount(key);
}

/**
 * Sends an HTTP request with automatic x402 payment retry.
 * 1. First attempt without payment header
 * 2. If 402, parse payment requirements from response body
 * 3. Sign EIP-712 typed data with the configured EOA
 * 4. Retry with X-PAYMENT header
 */
export async function fetchWithX402Payment(
  url: string,
  init: RequestInit
): Promise<Response> {
  const account = getPaymentAccount();

  let res = await fetch(url, init);
  if (res.status !== 402) return res;

  const paymentRequired = await res.json().catch(() => null);
  if (!paymentRequired) throw new Error("402 received but body was not parseable JSON");

  const walletClient = createWalletClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
    account,
  });

  const { domain, types, primaryType, message } =
    paymentRequired.paymentRequirements?.[0] ?? paymentRequired;

  const signature = await walletClient.signTypedData({
    domain, types, primaryType, message,
  });

  const paymentHeader = JSON.stringify({
    ...message,
    signature,
    paymentRequirements: paymentRequired.paymentRequirements ?? [paymentRequired],
  });

  const headers = new Headers(init.headers ?? {});
  headers.set("X-PAYMENT", paymentHeader);

  return fetch(url, { ...init, headers });
}
