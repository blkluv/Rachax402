import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { discoverBestAgent, getReputation } from "../lib/erc8004.js";
import type { Address } from "viem";

export function registerDiscoverTools(server: McpServer) {
  server.tool(
    "discover_service",
    "Query the ERC-8004 on-chain registry for a capability. Returns the best agent's endpoint URL, price in USDC, wallet address, and reputation score. Always call this before any paid operation.",
    { capability: z.enum(["analyze", "store", "retrieve"]).describe("'analyze' for CSV stats, 'store' for IPFS upload, 'retrieve' for IPFS retrieval") },
    async ({ capability }) => {
      try {
        const result = await discoverBestAgent(capability);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Discovery failed: ${msg}` }], isError: true };
      }
    }
  );

  server.tool(
    "get_agent_reputation",
    "Read the on-chain reputation score and rating count for any registered agent address.",
    { agentAddress: z.string().describe("Agent wallet address (0x...)") },
    async ({ agentAddress }) => {
      const rep = await getReputation(agentAddress as Address);
      return { content: [{ type: "text" as const, text: `${rep.score.toFixed(1)}/5 from ${rep.totalRatings} ratings` }] };
    }
  );
}
