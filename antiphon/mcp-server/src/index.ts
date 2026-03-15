#!/usr/bin/env node
/**
 * @rachax402/mcp-server
 *
 * MCP server exposing ERC-8004 agent discovery, x402 payment,
 * and Storacha storage tools for any LLM host.
 *
 * Transport: stdio (works with Cursor, Claude Desktop, any MCP client)
 *
 * Required env vars:
 *   RACHAX402_PRIVATE_KEY          — EOA for x402 payments + reputation posting
 *   BASE_RPC_URL                   — defaults to https://sepolia.base.org
 *   STORACHA_AGENT_PRIVATE_KEY     — for free CSV staging
 *   STORACHA_AGENT_DELEGATION      — Storacha space delegation
 *   ERC8004_IDENTITY_REGISTRY      — defaults to deployed address
 *   ERC8004_REPUTATION_REGISTRY    — defaults to deployed address
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDiscoverTools } from "./tools/discover.js";
import { registerAnalyzeTools } from "./tools/analyze.js";
import { registerStorageTools } from "./tools/storage.js";
import { registerReputationTools } from "./tools/reputation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

const server = new McpServer({
  name: "rachax402",
  version: "0.1.0",
});

registerDiscoverTools(server);
registerAnalyzeTools(server);
registerStorageTools(server);
registerReputationTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
