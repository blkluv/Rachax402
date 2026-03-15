/**
 * erc8004Provider.ts
 * Vercel AI SDK tools wrapping ERC-8004 on-chain registry for AgentKit.
 *
 * Exposes to Claude:
 *   discoverService(capability)                    → endpoint, price, walletAddress, reputation
 *   checkCanRate(targetAgentAddress, raterAddress) → rate-limit gate before postReputation
 *   postReputation(target, rating, comment, proofCID) → on-chain 1-5 rating
 *   getAgentReputation(agentAddress)               → score display
 *
 * Score math (from contract): reputation = Number(score) / 100
 * (SCORE_MULTIPLIER = 100, not 1e18 — confirmed from lean coordinator index.ts)
 *
 * Usage in create-agent.ts:
 *   import { getERC8004Tools } from "./providers/erc8004Provider";
 *   tools: { ...getVercelAITools(agentkit), ...getERC8004Tools(), ...getStorachaTools() }
 */

import { tool } from "ai";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { AgentIdentityABI as IDENTITY_ABI } from "../../../ABI/AgentIdentityABI";
import { AgentReputationABI as REPUTATION_ABI } from "../../../ABI/AgentReputationABI";

const IDENTITY_REGISTRY = (process.env.ERC8004_IDENTITY_REGISTRY) as Address;
const REPUTATION_REGISTRY = (process.env.ERC8004_REPUTATION_REGISTRY) as Address;
const RPC_URL = process.env.BASE_RPC_URL || 'https://sepolia.base.org';

const CAPABILITY_MAP: Record<string, { tag: string; endpointSuffix: string; pricingKey: string }> = {
  analyze: { tag: 'csv-analysis', endpointSuffix: '/analyze', pricingKey: 'baseRate' },
  store: { tag: 'file-storage', endpointSuffix: '/upload', pricingKey: 'upload' },
  retrieve: { tag: 'file-storage', endpointSuffix: '/retrieve', pricingKey: 'retrieve' },
};

const publicClient = createPublicClient({ transport: http(RPC_URL), chain: baseSepolia, });

async function getAgentsForCapability(capability: string): Promise<Address[]> {
  const config = CAPABILITY_MAP[capability];
  if (!config) throw new Error(`Unknown capability: ${capability}`);

  let agents = await publicClient.readContract({
    address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
    functionName: 'getAgentsByCapability', args: [config.tag],
  }) as Address[];

  if (!agents || agents.length === 0) {
    const [discovered] = await publicClient.readContract({
      address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
      functionName: 'discoverAgents', args: [[config.tag], 0n, 10n],
    }) as [Address[], bigint];
    agents = discovered || [];
  }

  return agents;
}

async function getReputation(addr: Address): Promise<{ score: number; totalRatings: number }> {
  try {
    const [score, totalRatings] = await publicClient.readContract({
      address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
      functionName: 'getReputationScore', args: [addr],
    }) as [bigint, bigint];
    return {
      score: Number(score) / 100,       // SCORE_MULTIPLIER = 100 per contract
      totalRatings: Number(totalRatings),
    };
  } catch {
    return { score: 0, totalRatings: 0 };
  }
}

async function resolveAgentCard(cid: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://w3s.link/ipfs/${cid}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── ERC-8004 Vercel AI SDK tools ──────────────────────────────────────────────
export function getERC8004Tools() {
  return {

    // ── discoverService ──────────────────────────────────────────────────────
    discoverService: tool({
      description: `Discover on-chain registered service agents for a capability via ERC-8004.
ALWAYS call this FIRST — before any payment or task. It reads the blockchain registry and returns:
the service endpoint URL, price in USDC, the agent's wallet address (payTo), and on-chain reputation.

Available capabilities:
  'analyze'  → DataAnalyzer: CSV statistical analysis ($0.01 USDC per task)
  'store'    → StorachaStorage: IPFS file upload ($0.1 USDC)
  'retrieve' → StorachaStorage: IPFS file retrieval by CID ($0.005 USDC)`,
      inputSchema: z.object({
        capability: z.enum(['analyze', 'store', 'retrieve'])
          .describe("Service type: 'analyze' for CSV stats, 'store' for IPFS upload, 'retrieve' for IPFS retrieval"),
      }),
      execute: async ({ capability }: { capability: 'analyze' | 'store' | 'retrieve' }): Promise<string> => {
        const config = CAPABILITY_MAP[capability];
        try {
          const agents = await getAgentsForCapability(capability);

          if (!agents || agents.length === 0) {
            return `No agents registered for capability: ${config.tag}. Run register-services.js first.`;
          }

          // Score all agents, pick highest reputation
          const withRep = await Promise.all(
            agents.map(async (addr) => ({ addr, ...await getReputation(addr) }))
          );
          const best = withRep.sort((a, b) => b.score - a.score)[0];

          const cardCID = await publicClient.readContract({
            address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
            functionName: 'getAgentCard', args: [best.addr],
          }) as string;

          const card = await resolveAgentCard(cardCID);

          let endpoint: string;
          let price: number;
          let payTo: string;
          let agentName: string;

          if (card) {
            const baseUrl = (card.endpoint as string).replace(/\/(upload|analyze|retrieve)$/, '');
            endpoint = `${baseUrl}${config.endpointSuffix}`;
            payTo = (card.walletAddress as string) || best.addr;
            price = (card.pricing as any)?.[config.pricingKey] ?? (card.pricing as any)?.baseRate ?? 0.001;
            agentName = (card.name as string) || 'Service Provider';
          } else {
            // Fallback to known localhost addresses if IPFS unreachable
            endpoint = capability === 'analyze'
              ? `https://rachax402-analyzer-service.up.railway.app${config.endpointSuffix}` //  http://localhost:8001
              : `https://rachax402-storacha-service.up.railway.app${config.endpointSuffix}`; //  http://localhost:8001 
            payTo = best.addr;
            price = config.pricingKey === 'baseRate' ? 0.01 : config.pricingKey === 'upload' ? 0.1 : 0.005;
            agentName = 'Service Provider (card unavailable)';
          }

          return JSON.stringify({
            found: true,
            agentAddress: best.addr,
            agentAddressTruncated: `${best.addr.slice(0, 10)}...${best.addr.slice(-8)}`,
            serviceName: agentName,
            endpoint,
            price: `$${price} USDC`,
            payTo,
            reputation: `${best.score}/5`,
            totalRatings: best.totalRatings,
            capability: config.tag,
            logLine: `Service: ${agentName}\nEndpoint: ${endpoint}\nPrice: $${price} USDC\nPays to: ${payTo}`,
          });
        } catch (err: any) {
          return `Discovery failed: ${err.message}`;
        }
      },
    }),

    // ── checkCanRate ─────────────────────────────────────────────────────────
    checkCanRate: tool({
      description: `Check if the ERC-8004 rate limit allows posting an on-chain reputation for an agent.
ALWAYS call this before postReputation to avoid RateLimitExceeded on-chain errors.
Returns canRate: true/false and when the cooldown ends if blocked.
The raterAddress is AgentA's CDP Smart Wallet address (get it with getWalletDetails tool).`,
      inputSchema: z.object({
        targetAgentAddress: z.string().describe("Wallet address of the AgentB to rate (0x...)"),
        raterAddress: z.string().describe("AgentA's CDP Smart Wallet address that will submit the rating (0x...)"),
      }),
      execute: async ({ targetAgentAddress, raterAddress }: { targetAgentAddress: string, raterAddress: string }): Promise<string> => {
        try {
          const [allowed, nextAllowedTime] = await publicClient.readContract({
            address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
            functionName: 'canRate',
            args: [raterAddress as Address, targetAgentAddress as Address],
          }) as [boolean, bigint];

          if (allowed) {
            return JSON.stringify({ canRate: true, message: '✅ Rate limit OK — proceed with postReputation.' });
          }
          const cooldownEnd = new Date(Number(nextAllowedTime) * 1000).toLocaleString();
          return JSON.stringify({
            canRate: false,
            nextAllowedTime: Number(nextAllowedTime),
            message: `⏭️ Reputation skipped — rate limit active until ${cooldownEnd}. Task still succeeded.`,
          });
        } catch (err: any) {
          return JSON.stringify({ canRate: false, error: err.message });
        }
      },
    }),

    // ── postReputation ────────────────────────────────────────────────────────
    postReputation: tool({
      description: `Post an on-chain reputation rating for an AgentB after successful task completion.
ONLY call this if checkCanRate returned canRate: true. Never call if canRate returned false.
Always use rating=5 for successful service delivery.
proofCID is the IPFS CID of the task result — the resultCID from analysis or the file CID from storage.
Uses AGENT_A_PRIVATE_KEY env var to sign the transaction (EOA, not CDP Smart Wallet).`,
      inputSchema: z.object({
        targetAgentAddress: z.string().describe("AgentB wallet address to rate"),
        rating: z.number().int().min(1).max(5).describe("Rating 1-5 (use 5 for successful delivery)"),
        comment: z.string().describe("Short description e.g. 'CSV analysis delivered accurately'"),
        proofCID: z.string().describe("IPFS CID of the result as verifiable proof"),
      }),
      execute: async ({ targetAgentAddress, rating, comment, proofCID }: { targetAgentAddress: string, rating: number, comment: string, proofCID: string }): Promise<string> => {
        try {
          const privateKey = process.env.AGENT_A_PRIVATE_KEY as `0x${string}`;
          if (!privateKey) return 'AGENT_A_PRIVATE_KEY not set — cannot sign reputation transaction';

          const account = privateKeyToAccount(privateKey);
          const walletClient = createWalletClient({ chain: baseSepolia, transport: http(RPC_URL), account });

          const hash = await walletClient.writeContract({
            chain: baseSepolia,
            address: REPUTATION_REGISTRY,
            abi: REPUTATION_ABI,
            functionName: 'postReputation',
            args: [targetAgentAddress as Address, rating as unknown as number, comment, proofCID],
            account,
          });

          await publicClient.waitForTransactionReceipt({ hash });
          return JSON.stringify({
            success: true,
            txHash: hash,
            baseScanUrl: `https://sepolia.basescan.org/tx/${hash}`,
            message: `⭐ Reputation posted on-chain! ${rating}/5 for ${targetAgentAddress.slice(0, 10)}...\nTx: ${hash}`,
          });
        } catch (err: any) {
          if (err.message?.includes('RateLimitExceeded')) {
            return '⏭️ RateLimitExceeded — reputation skipped. Task still succeeded.';
          }
          return `postReputation failed: ${err.message}`;
        }
      },
    }),

    // ── getAgentReputation ────────────────────────────────────────────────────
    getAgentReputation: tool({
      description: 'Read on-chain reputation score and rating count for any registered AgentB.',
      inputSchema: z.object({
        agentAddress: z.string().describe("Agent wallet address (0x...)"),
      }),
      execute: async ({ agentAddress }: { agentAddress: string }): Promise<string> => {
        const rep = await getReputation(agentAddress as Address);
        return `${rep.score.toFixed(1)}/5 from ${rep.totalRatings} ratings`;
      },
    }),

  };
}