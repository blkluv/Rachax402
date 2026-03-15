/**
 * prepare-agentkit.ts — Rachax402 AgentKit Setup
 *
 * === ACTION PROVIDER CHANGES ===
 * Removed:
 *   ✗ wethActionProvider()  — WethActionProvider_wrap_eth has schema { type: "None" }.
 *                             Rachax402 has zero use for WETH wrapping.
 *   ✗ pythActionProvider()  — Pyth price feeds not used in Rachax402.
 *                             Produces schema issues on some versions.
 *
 * Kept:
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
import { Address, Hex, LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const WALLET_DATA_FILE = "wallet_data.txt";

type WalletData = {
  privateKey?: Hex;
  smartWalletAddress: Address;
  ownerAddress?: Address;
};

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
        console.log(`[AgentKit] No ownerAddress or privateKey in ${WALLET_DATA_FILE}, creating new CDP account`);
      }
    } catch (error) {
      console.error("[AgentKit] Error reading wallet data:", error);
    }
  }

  try {
    const walletProvider = await CdpSmartWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID,
      apiKeySecret: process.env.CDP_API_KEY_SECRET,
      walletSecret: process.env.CDP_WALLET_SECRET,
      networkId: process.env.NETWORK_ID || "base-sepolia",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      owner: owner as any,
      address: walletData?.smartWalletAddress,
      paymasterUrl: process.env.PAYMASTER_URL,
      rpcUrl: process.env.RPC_URL,
      idempotencyKey: process.env.IDEMPOTENCY_KEY,
    });

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
        x402ActionProvider(),
        // ✗ wethActionProvider() — REMOVED: schema { type: "None" } breaks OpenAI API
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