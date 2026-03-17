/**
 * prepare-agentkit.ts — Rachax402 AgentKit Setup
 *
 * Uses CdpSmartWalletProvider as the sole wallet. x402 payments use Permit2 + EIP-1271
 * (smart wallet compatible); servers advertise assetTransferMethod: "permit2".
 *
 * ─── WHY THE PERMIT2 BOOTSTRAP EXISTS ──────────────────────────────────────────
 * x402 "exact/evm" with assetTransferMethod:"permit2" works like this:
 *   1. Client signs a PermitWitnessTransferFrom message (no on-chain tx, just a sig).
 *   2. CDP facilitator calls Permit2.permitWitnessTransferFrom() on Base Sepolia.
 *   3. Permit2 checks: does the smart wallet have USDC.allowance(wallet, Permit2) > 0?
 *   4. If allowance == 0 → revert → "Payment was not settled".
 *
 * The x402/evm client has two auto-approval paths that would normally fix this:
 *   - eip2612GasSponsoring   → server must advertise; CDP facilitator does NOT.
 *   - erc20ApprovalGasSponsoring → requires signTransaction; CdpSmartWalletProvider throws.
 *
 * Therefore the ONLY way to unblock payments is a one-time
 *   USDC.approve(Permit2, MaxUint256)
 * sent FROM the smart wallet as an ERC-4337 user operation.
 *
 * ensurePermit2Approval() does this at startup: reads allowance, skips if already set,
 * sends the approval userOp and polls until confirmed (up to 90 s).
 * After the first successful run the allowance stays set permanently —
 * subsequent startups are instant (allowance check only, no tx).
 * ────────────────────────────────────────────────────────────────────────────────
 *
 *   ✓ walletActionProvider()          — getWalletDetails, getBalance
 *   ✓ erc20ActionProvider()           — ERC-20 transfers (for USDC payments)
 *   ✓ cdpApiActionProvider()          — CDP faucet on testnet
 *   ✓ cdpSmartWalletActionProvider()  — Smart wallet management
 *   ✓ x402ActionProvider()            — fetchWithPayment (core to Rachax402)
 */

import {
  AgentKit,
  cdpApiActionProvider,
  cdpSmartWalletActionProvider,
  erc20ActionProvider,
  CdpSmartWalletProvider,
  walletActionProvider,
  WalletProvider,
  x402ActionProvider,
} from "@coinbase/agentkit";
import * as fs from "fs";
import {
  Address,
  Hex,
  LocalAccount,
  createPublicClient,
  encodeFunctionData,
  http,
  maxUint256,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
 
// ── Constants ──────────────────────────────────────────────────────────────────
// USDC on Base Sepolia
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
// Universal Permit2 — same address on every EVM chain (Uniswap Labs deployment)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
 
const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;
 
const WALLET_DATA_FILE = "wallet_data.txt";
 
type WalletData = {
  privateKey?: Hex;
  smartWalletAddress: Address;
  ownerAddress?: Address;
};
 
// ── Permit2 bootstrap ─────────────────────────────────────────────────────────
/**
 * Ensures the CDP Smart Wallet has approved the Permit2 contract to spend USDC.
 *
 * This is a one-time prerequisite for all x402 Permit2 payments. Idempotent:
 * if allowance > 0 it returns immediately without spending gas.
 *
 * Flow:
 *   read USDC.allowance(smartWallet, Permit2)
 *   → if > 0: done (fast path, no tx)
 *   → if == 0: send USDC.approve(Permit2, MaxUint256) as ERC-4337 user op
 *              poll allowance until confirmed (max 90 s)
 */
async function ensurePermit2Approval(walletProvider: CdpSmartWalletProvider): Promise<void> {
  const smartWalletAddress = walletProvider.getAddress() as Address;
  const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
  const networkId = process.env.NETWORK_ID || "base-sepolia";
 
  const publicClient = createPublicClient({
    transport: http(rpcUrl),
    chain: baseSepolia,
  });
 
  // 1. Read current allowance — if already set, fast-path return
  let allowance: bigint;
  try {
    allowance = await publicClient.readContract({
      address: USDC_BASE_SEPOLIA,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [smartWalletAddress, PERMIT2_ADDRESS],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Permit2] Could not read allowance (${msg}) — skipping bootstrap.`);
    return;
  }
 
  if (allowance > 0n) {
    console.log(`[Permit2] ✅ Allowance already set (${allowance.toString()} wei) — skipping approval.`);
    return;
  }
 
  // 2. Allowance is 0 — need to send approval userOp
  console.log("[Permit2] Allowance is 0 — sending USDC.approve(Permit2, MaxUint256) as userOp…");
  console.log(`[Permit2]   Smart wallet : ${smartWalletAddress}`);
  console.log(`[Permit2]   USDC         : ${USDC_BASE_SEPOLIA}`);
  console.log(`[Permit2]   Permit2      : ${PERMIT2_ADDRESS}`);
 
  // The CDP SDK sendUserOperation requires a paymasterUrl.
  // If PAYMASTER_URL is not in .env, auto-construct the CDP Base Sepolia paymaster URL.
  // Format: https://api.developer.coinbase.com/rpc/v1/{network}/{apiKeyId}
  // This is the free CDP gas-sponsoring endpoint for testnet user operations.
  if (!process.env.PAYMASTER_URL) {
    const constructed = `https://api.developer.coinbase.com/rpc/v1/${networkId}/${process.env.CDP_API_KEY_ID}`;
    process.env.PAYMASTER_URL = constructed;
    console.log(`[Permit2] PAYMASTER_URL not set — using CDP default`);
  }
 
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "approve",
    args: [PERMIT2_ADDRESS, maxUint256],
  });
 
  let userOpHash: string;
  try {
    userOpHash = await walletProvider.sendTransaction({
      to: USDC_BASE_SEPOLIA,
      data: approveData,
      value: 0n,
    });
    console.log(`[Permit2] UserOp submitted — hash: ${userOpHash}`);
    console.log(`[Permit2] Explorer: https://sepolia.basescan.org/address/${smartWalletAddress}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Non-fatal: warn clearly but don't crash AgentKit startup.
    // The agent will start but x402 payments will fail until the approval is confirmed.
    // Add PAYMASTER_URL to your .env to fix this on next restart:
    //   PAYMASTER_URL=https://api.developer.coinbase.com/rpc/v1/base-sepolia/<CDP_API_KEY_ID>
    console.warn(
      `\n[Permit2] ⚠️  Could not send USDC approval userOp: ${msg}\n` +
      `[Permit2] x402 payments will fail until Permit2 is approved.\n` +
      `[Permit2] Fix: add to your .env:\n` +
      `[Permit2]   PAYMASTER_URL=https://api.developer.coinbase.com/rpc/v1/${networkId}/CDP_API_KEY_ID\n` +
      `[Permit2] Then restart — the approval will be sent automatically.\n` +
      `[Permit2] Or approve manually at: https://sepolia.basescan.org/address/${smartWalletAddress}\n`,
    );
    return; // non-fatal — AgentKit starts, payments blocked until fixed
  }
 
  // 3. Poll until the allowance is confirmed on-chain (max 90 s)
  const POLL_MS = 3000;
  const MAX_POLLS = 30;
 
  for (let i = 1; i <= MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const updated = await publicClient.readContract({
        address: USDC_BASE_SEPOLIA,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [smartWalletAddress, PERMIT2_ADDRESS],
      });
      if (updated > 0n) {
        console.log(
          `[Permit2] ✅ Approval confirmed on-chain after ${i * (POLL_MS / 1000)}s` +
          ` — allowance: ${updated.toString()} wei`,
        );
        return;
      }
    } catch {
      // transient RPC hiccup — keep polling
    }
    console.log(`[Permit2] Waiting for approval to confirm… (${i}/${MAX_POLLS})`);
  }
 
  console.warn(
    "[Permit2] ⚠️  Approval not confirmed within 90 s — userOp may still be pending.\n" +
    "Restart once it confirms; subsequent restarts will be instant.",
  );
}
 
// ── Main export ───────────────────────────────────────────────────────────────
export async function prepareAgentkitAndWalletProvider(): Promise<{
  agentkit: AgentKit;
  walletProvider: WalletProvider;
}> {
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    throw new Error(
      "CDP_API_KEY_ID and CDP_API_KEY_SECRET required in .env to connect to Coinbase Developer Platform.",
    );
  }
 
  let walletData: WalletData | null = null;
  let owner: Hex | LocalAccount | undefined = undefined;
 
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")) as WalletData;
      if (walletData.ownerAddress) {
        owner = walletData.ownerAddress;
      } else if (walletData.privateKey) {
        owner = privateKeyToAccount(walletData.privateKey as Hex);
      } else {
        console.log(
          `[AgentKit] No ownerAddress or privateKey in ${WALLET_DATA_FILE}, creating new CDP account`,
        );
      }
    } catch (error) {
      console.error("[AgentKit] Error reading wallet data:", error);
    }
  }
 
  try {
    const networkId = process.env.NETWORK_ID || "base-sepolia";
    const paymasterUrl =
      process.env.PAYMASTER_URL ||
      `https://api.developer.coinbase.com/rpc/v1/${networkId}/${process.env.CDP_API_KEY_ID}`;
 
    const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
      networkId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      owner: owner as any,
      address: walletData?.smartWalletAddress,
      paymasterUrl,
      rpcUrl: process.env.RPC_URL,
      idempotencyKey: process.env.IDEMPOTENCY_KEY,
    });
 
    // ── CRITICAL: ensure Permit2 is approved to spend USDC from the smart wallet
    // Must run BEFORE AgentKit is created and BEFORE any x402 payment attempt.
    // On subsequent restarts this is a fast no-op (allowance already set).
    await ensurePermit2Approval(walletProvider);
 
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        // ✓ Core wallet tools — needed by system prompt (getWalletDetails, getBalance)
        walletActionProvider(),
        // ✓ ERC-20 — USDC transfers if needed
        erc20ActionProvider(),
        // ✓ CDP API — testnet faucet on base-sepolia
        cdpApiActionProvider(),
        // ✓ Smart wallet management
        cdpSmartWalletActionProvider(),
        // ✓ x402 — fetchWithPayment — THE core Rachax402 payment primitive
        // Signs PermitWitnessTransferFrom; CDP facilitator calls Permit2 on-chain.
        // Requires Permit2 allowance set above.
        x402ActionProvider(),
        // ✗ wethActionProvider() — REMOVED: schema { type: "None" } breaks Anthropic API
        // ✗ pythActionProvider() — REMOVED: not used in Rachax402
      ],
    });
 
    if (!walletData) {
      const exportedWallet = await walletProvider.exportWallet();
      fs.writeFileSync(
        WALLET_DATA_FILE,
        JSON.stringify({
          ownerAddress: exportedWallet.ownerAddress,
          smartWalletAddress: exportedWallet.address,
        } as WalletData),
      );
      console.log(`[AgentKit] New CDP Smart Wallet created and saved to ${WALLET_DATA_FILE}`);
    }
 
    console.log(`[AgentKit] Ready on ${process.env.NETWORK_ID || "base-sepolia"}`);
    return { agentkit, walletProvider };
  } catch (error) {
    console.error("[AgentKit] Initialization error:", error);
    throw new Error("Failed to initialize AgentKit — check CDP credentials in .env");
  }
}