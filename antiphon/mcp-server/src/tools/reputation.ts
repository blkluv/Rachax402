import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createWalletClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../lib/erc8004.js";
import { REPUTATION_REGISTRY, RPC_URL } from "../lib/contracts.js";
import { AgentReputationABI as REPUTATION_ABI } from "../lib/abi/AgentReputationABI.js";

export function registerReputationTools(server: McpServer) {
  server.tool(
    "check_can_rate",
    "Check ERC-8004 rate limit before posting an on-chain reputation. Always call this before post_reputation to avoid RateLimitExceeded on-chain errors.",
    {
      targetAgentAddress: z.string().describe("Wallet address of the agent to rate (0x...)"),
      raterAddress: z.string().describe("Your wallet address that will submit the rating (0x...)"),
    },
    async ({ targetAgentAddress, raterAddress }) => {
      try {
        const [allowed, nextAllowedTime] = await publicClient.readContract({
          address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
          functionName: "canRate",
          args: [raterAddress as Address, targetAgentAddress as Address],
        }) as [boolean, bigint];

        if (allowed) {
          return { content: [{ type: "text" as const, text: JSON.stringify({ canRate: true, message: "Rate limit OK — proceed with post_reputation." }) }] };
        }
        const cooldownEnd = new Date(Number(nextAllowedTime) * 1000).toISOString();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ canRate: false, nextAllowedTime: cooldownEnd, message: `Rate limit active until ${cooldownEnd}. Skip reputation — task still succeeded.` }),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: JSON.stringify({ canRate: false, error: msg }) }], isError: true };
      }
    }
  );

  server.tool(
    "post_reputation",
    "Post an on-chain 1-5 reputation rating for an agent after successful task completion. Only call if check_can_rate returned canRate: true. proofCID is the IPFS CID of the task result as verifiable proof.",
    {
      targetAgentAddress: z.string().describe("Agent wallet address to rate"),
      rating: z.number().int().min(1).max(5).describe("Rating 1-5 (use 5 for successful delivery)"),
      comment: z.string().describe("Short description e.g. 'CSV analysis delivered accurately'"),
      proofCID: z.string().describe("IPFS CID of the result as verifiable proof"),
    },
    async ({ targetAgentAddress, rating, comment, proofCID }) => {
      try {
        const privateKey = process.env.RACHAX402_PRIVATE_KEY as `0x${string}`;
        if (!privateKey) return { content: [{ type: "text" as const, text: "RACHAX402_PRIVATE_KEY not set — cannot sign reputation transaction" }], isError: true };

        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({ chain: baseSepolia, transport: http(RPC_URL), account });

        const hash = await walletClient.writeContract({
          chain: baseSepolia,
          address: REPUTATION_REGISTRY,
          abi: REPUTATION_ABI,
          functionName: "postReputation",
          args: [targetAgentAddress as Address, rating, comment, proofCID],
          account,
        });

        await publicClient.waitForTransactionReceipt({ hash });

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true, txHash: hash,
              baseScanUrl: `https://sepolia.basescan.org/tx/${hash}`,
              message: `Reputation posted on-chain: ${rating}/5 for ${targetAgentAddress.slice(0, 10)}...`,
            }),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("RateLimitExceeded")) {
          return { content: [{ type: "text" as const, text: "RateLimitExceeded — reputation skipped. Task still succeeded." }] };
        }
        return { content: [{ type: "text" as const, text: `post_reputation failed: ${msg}` }], isError: true };
      }
    }
  );
}
