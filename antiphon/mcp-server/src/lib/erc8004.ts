import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import {
  IDENTITY_REGISTRY, REPUTATION_REGISTRY,
  RPC_URL, CAPABILITY_MAP,
} from "./contracts.js";
import { AgentIdentityABI as IDENTITY_ABI } from "./abi/AgentIdentityABI.js";
import { AgentReputationABI as REPUTATION_ABI } from "./abi/AgentReputationABI.js";

const publicClient = createPublicClient({ transport: http(RPC_URL), chain: baseSepolia });

export { publicClient };

export async function getAgentsForCapability(capability: string): Promise<Address[]> {
  const config = CAPABILITY_MAP[capability];
  if (!config) throw new Error(`Unknown capability: ${capability}`);

  let agents = await publicClient.readContract({
    address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
    functionName: "getAgentsByCapability", args: [config.tag],
  }) as Address[];

  if (!agents || agents.length === 0) {
    const [discovered] = await publicClient.readContract({
      address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
      functionName: "discoverAgents", args: [[config.tag], 0n, 10n],
    }) as [Address[], bigint];
    agents = discovered || [];
  }

  return agents;
}

export async function getReputation(addr: Address): Promise<{ score: number; totalRatings: number }> {
  try {
    const [score, totalRatings] = await publicClient.readContract({
      address: REPUTATION_REGISTRY, abi: REPUTATION_ABI,
      functionName: "getReputationScore", args: [addr],
    }) as [bigint, bigint];
    return { score: Number(score) / 100, totalRatings: Number(totalRatings) };
  } catch {
    return { score: 0, totalRatings: 0 };
  }
}

export async function resolveAgentCard(cid: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://w3s.link/ipfs/${cid}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch { return null; }
}

export async function discoverBestAgent(capability: "analyze" | "store" | "retrieve") {
  const config = CAPABILITY_MAP[capability];
  const agents = await getAgentsForCapability(capability);

  if (!agents || agents.length === 0) {
    return { found: false, error: `No agents registered for capability: ${config.tag}` };
  }

  const withRep = await Promise.all(
    agents.map(async (addr) => ({ addr, ...await getReputation(addr) }))
  );
  const best = withRep.sort((a, b) => b.score - a.score)[0];

  const cardCID = await publicClient.readContract({
    address: IDENTITY_REGISTRY, abi: IDENTITY_ABI,
    functionName: "getAgentCard", args: [best.addr],
  }) as string;

  const card = await resolveAgentCard(cardCID);

  let endpoint: string;
  let price: number;
  let payTo: string;
  let agentName: string;

  if (card) {
    const baseUrl = (card.endpoint as string).replace(/\/(upload|analyze|retrieve)$/, "");
    endpoint = `${baseUrl}${config.endpointSuffix}`;
    payTo = (card.walletAddress as string) || best.addr;
    price = (card.pricing as Record<string, number>)?.[config.pricingKey] ?? 0.001;
    agentName = (card.name as string) || "Service Provider";
  } else {
    endpoint = capability === "analyze"
      ? `https://rachax402-analyzer-service.up.railway.app${config.endpointSuffix}`
      : `https://rachax402-storacha-service.up.railway.app${config.endpointSuffix}`;
    payTo = best.addr;
    price = config.pricingKey === "baseRate" ? 0.01 : config.pricingKey === "upload" ? 0.1 : 0.005;
    agentName = "Service Provider (card unavailable)";
  }

  return {
    found: true,
    agentAddress: best.addr,
    serviceName: agentName,
    endpoint, price, payTo,
    reputation: { score: best.score, totalRatings: best.totalRatings },
    capability: config.tag,
  };
}
