# Rachax402 — Onchain Agent (AgentA)

![Storacha](https://img.shields.io/badge/Storacha-red?logo=Storacha) ![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![AgentKit](https://img.shields.io/badge/Coinbase-AgentKit-0052FF?logo=coinbase) ![Base](https://img.shields.io/badge/Base-Sepolia-0052FF) ![x402](https://img.shields.io/badge/x402-payments-10b981)

Autonomous agent orchestrator for the Rachax402 decentralised agent marketplace on Base Sepolia. Claude + AgentKit + ERC-8004 + x402 + Storacha.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM Hosts                                │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Next.js UI   │  │ Cursor /     │  │ Any MCP-compatible │    │
│  │ (this app)   │  │ Claude Desktop│  │ app                │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘    │
│         │                 │                    │                │
│         ▼                 └────────┬───────────┘                │
│  ┌──────────────┐          ┌──────▼──────────┐                  │
│  │ Claude +     │          │ @rachax402/     │                  │
│  │ AgentKit +   │          │ mcp-server      │                  │
│  │ ERC-8004 +   │          │ (stdio)         │                  │
│  │ Storacha     │          │ 8 tools         │                  │
│  │ providers    │          └──────┬──────────┘                  │
│  └──────┬───────┘                 │                             │
│         │                         │                             │
└─────────┼─────────────────────────┼─────────────────────────────┘
          │                         │
          ▼                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   On-Chain (Base Sepolia)                        │
│  ERC-8004 IdentityRegistry   0x1352abA587fF...                  │
│  ERC-8004 ReputationRegistry 0x3FdD300147...                    │
└─────────────────────────────────────────────────────────────────┘
          │  discoverAgents() → agentCard CID → IPFS → endpoint
          ▼
┌─────────────────────────────────────────────────────────────────┐
│               Railway Services (x402-gated)                     │
│  DataAnalyzer    POST /analyze   $0.01 USDC  0xEAB418...       │
│  StorachaStorage POST /upload    $0.10 USDC  0x9D48b6...       │
│                  GET  /retrieve  $0.005 USDC                    │
└─────────────────────────────────────────────────────────────────┘
```

## Agentic Services Workflow

**CSV analyze**
```
User uploads CSV → discoverService('analyze') → stageCsvForAnalysis(filename) 
→ X402 POST /analyze → 402 → sign EIP-712 → paid → resultCID + stats 
→ checkCanRate → postReputation
```

**File store**
```
User uploads file → discoverService('store') → paidStoreFile(filename, endpoint) 
→ X402 POST /upload → paid → CID
```

**File retrieve**
```
User types CID → discoverService('retrieve') → paidRetrieveFile(cid, endpoint) 
→ X402 GET /retrieve → paid → file
```

File bytes are stored server-side (`file-context.ts`). Tools receive only `filename` — no base64 in LLM output.

## Getting Started

### Prerequisites

| Key | Source |
|-----|--------|
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) |
| `CDP_API_KEY_NAME` + `CDP_API_KEY_PRIVATE_KEY` | [CDP Portal](https://portal.cdp.coinbase.com/) |
| `STORACHA_AGENT_PRIVATE_KEY` + `STORACHA_AGENT_DELEGATION` | Storacha CLI (`storacha key create`) |

### Install & Run

```sh
cd onchain-agent
pnpm install
cp .env.example .env   # fill in keys
pnpm dev               # http://localhost:3000
```

## MCP Server (`../mcp-server/`)

Standalone MCP server exposing the same ERC-8004 + x402 + Storacha capabilities to any LLM host via stdio transport.

### Tools Exposed

| Tool | Description |
|------|-------------|
| `discover_service` | Query ERC-8004 for capability → endpoint, price, reputation |
| `get_agent_reputation` | Read on-chain reputation score for any agent address |
| `stage_csv` | Free upload CSV to Storacha IPFS → inputCID |
| `analyze_csv` | Pay DataAnalyzer via x402, submit inputCID → resultCID + stats |
| `store_file` | Pay StorachaStorage via x402, upload file → CID |
| `retrieve_file` | Pay StorachaStorage via x402, retrieve by CID |
| `check_can_rate` | Check ERC-8004 rate limit before posting reputation |
| `post_reputation` | Post on-chain 1–5 rating with proof CID |

### Setup

```sh
cd mcp-server
npm install && npm run build
cp .env.example .env   # fill in RACHAX402_PRIVATE_KEY + Storacha keys
```

### Connect to Cursor

Add to `.cursor/mcp.json` (workspace root):

```json
{
  "mcpServers": {
    "rachax402": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

The server self-loads its own `.env` — no secrets needed in the Cursor config. Restart Cursor after editing `mcp.json`.

### Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rachax402": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

### How It Works

```
LLM Host (Cursor/Claude Desktop)
  │  JSON-RPC over stdio
  ▼
McpServer (rachax402, 8 tools)
  │
  ├─ discover_service ──► ERC-8004 IdentityRegistry (on-chain read)
  │                        → getAgentsByCapability → getAgentCard → IPFS fetch
  │                        → returns { endpoint, price, payTo, reputation }
  │
  ├─ stage_csv ──────────► Storacha IPFS (free, server's own credentials)
  │
  ├─ analyze_csv ────────► Railway DataAnalyzer /analyze
  ├─ store_file ─────────► Railway StorachaStorage /upload
  ├─ retrieve_file ──────► Railway StorachaStorage /retrieve
  │                        (all three: attempt → 402 → sign EIP-712 → retry with X-PAYMENT)
  │
  └─ post_reputation ───► ERC-8004 ReputationRegistry (on-chain write)
```

### Why x402 uses Permit2 for our agentic system

-  Our Agentic x402 Payment flow is:

```
AgentA (smart wallet)                  agentB-server          CDP Facilitator
      │                                      │                       │
      │  POST /analyze (no payment)          │                       │
      │─────────────────────────────────────▶│                       │
      │◀──── 402 + payment requirements ─────│                       │
      │                                      │                       │
      │  signs Permit2 message OFF-CHAIN     │                       │
      │  (costs 0 gas, instant)              │                       │
      │                                      │                       │
      │  POST /analyze + X-Payment: <sig>    │                       │
      │─────────────────────────────────────▶│                       │
      │                                      │──── POST /verify ────▶│
      │                                      │◀─── valid ────────────│
      │                                      │                       │
      │                                      │──── POST /settle ────▶│
      │                                      │     CDP calls:         │
      │                                      │     Permit2.permitWitness│
      │                                      │     TransferFrom()    │
      │                                      │     moves 0.01 USDC   │
      │                                      │     0xf2e2 → 0xEAB4   │
      │◀──── 200 + analysis result ──────────│                       │

```

The signing step is free and instant (no gas). The only on-chain transaction is the actual USDC transfer, which the facilitator submits. This is perfect for agents because:

AgentA can pay for dozens of services without waiting for or paying for multiple approval transactions
The CDP facilitator handles all the gas for the actual transfer
Each payment is cryptographically authorised by the smart wallet's signature

---

## Troubleshooting & Fixes

### 1. Vercel AI SDK v5 Compatibility

**`parameters` → `inputSchema` (create-agent.ts)**

AgentKit's `getVercelAITools()` returns tools in AI SDK v4 format where schemas live in `parameters`. AI SDK v5's Anthropic provider reads only `inputSchema`. Without the fix, Anthropic API returns `input_schema.type: Field required`. The `sanitizeAgentKitTools()` function in `create-agent.ts` detects v4-format tools and wraps them with `jsonSchema()` to produce valid `inputSchema`.

**`fullStream` property renames (route.ts)**

AI SDK v5 changed `fullStream` part properties:
- `text-delta`: `textDelta` → `delta`
- `tool-result`: `result` → `output`

The stream handler uses a fallback chain to support both:
```ts
const td = (part as any).textDelta ?? (part as any).delta ?? (part as any).text;
const output = (part as any).output ?? (part as any).result;
```

**`onFinish` multi-turn memory (route.ts)**

Previously `onFinish` only saved `text`, losing all tool-call and tool-result context between turns. Fixed to persist `response.messages` which includes the full assistant + tool-call + tool-result sequence. Claude now sees prior tool interactions in follow-up turns.

### 2. Stream Starvation / Browser Timeout (route.ts, storachaProvider.ts)

**Symptom**: Frontend shows "Could not reach AgentA" after ~2.5 min despite the server still processing. Storacha staging logs appear *after* the stream reports done.

**Root cause (two compounding issues)**:

1. **LLM re-generating base64**: `stageCsvForAnalysis` and `paidStoreFile` accepted `base64Data` as a tool parameter. Claude had to output the entire file content token-by-token (~6000 tokens for a 13KB CSV). During this, the SDK emitted `tool-input-delta` events server-side but the stream handler never forwarded them to the client — zero bytes reached the browser for minutes, and the TCP connection died.

2. **No heartbeat**: Even after tool input completes, actual tool execution (Storacha IPFS upload, x402 payment cycles) blocks the `fullStream` iterator. No data flows during execution, compounding the timeout.

**Fixes**:

- **Server-side file context** (`file-context.ts`): file bytes extracted in `route.ts` and stored server-side. Tools now accept only `filename` and read bytes from the store. Claude outputs a single short string instead of thousands of base64 tokens. Tool calls went from minutes of LLM output to milliseconds.
- **4s heartbeat** (`h:\n`): interval in the stream handler keeps data flowing during tool execution. Frontend parser silently ignores `h:` lines.
- **Emit `b:` on `tool-input-start`** instead of `tool-call`: client gets notified the instant Claude begins a tool call, not after all input is streamed.

### 3. Base64 Stripping Bug (route.ts)

A regex stripped base64 blobs from **all** messages including the current one. Claude then hallucinated a short base64 (decoded to ~6 garbage bytes) and stopped the pipeline. Fix: only strip base64 from **history** messages, never the current turn. (Now obsolete — base64 is no longer embedded in messages at all, see fix #2.)

### 4. AgentB Railway — Startup Crash + x402 `initialize()` Failure

**Phase 1 — Startup crash** (`agentB-server.js`, `storacha-server.js`):

`paymentMiddleware` with `syncFacilitatorOnStart = true` (default) eagerly called `httpServer.initialize()`. A transient network failure fetching `x402.org/facilitator` caused an unhandled promise rejection that crashed the process. Fixes:

1. `syncFacilitatorOnStart = false` — defer facilitator sync
2. `/health` endpoint moved before `paymentMiddleware` — always accessible
3. `warmFacilitator()` retry loop added in `start()` — graceful pre-check

**Phase 2 — 500 on first request** (same files):

After Phase 1, the server started fine but every `/analyze` or `/upload` request returned 500:
```
Error: Facilitator does not support exact on eip155:84532.
Make sure to call initialize() to fetch supported kinds from facilitators.
```

`warmFacilitator()` only pinged the facilitator URL to check network reachability — it never called `resourceServer.initialize()` which fetches the supported payment kinds (schemes + networks). The middleware with `syncFacilitatorOnStart = false` was expected to do lazy init on first request, but this version of `@x402/core` skips init entirely.

Fix: replaced `warmFacilitator()` with `warmAndInitialize()` which does two things in sequence with retries:
1. Ping facilitator URL (network reachability)
2. Call `resourceServer.initialize()` (fetches payment kinds)

### 5. x402 Payment Never Settling — Version Mismatch (`server/package.json`)

**Symptom**: AgentA's `X402ActionProvider_make_http_request_with_x402` consistently returned `"Request failed with status 402. Payment was not settled."` even though the service was up and the wallet had USDC. The `retry_http_request_with_x402` fallback also failed with `"Cannot read properties of undefined (reading 'network')"`.

**Root cause**: The client (AgentKit in onchain-agent) ships `@x402/core` **v2.5.0** while the server (Railway services) had `@x402/*` **v2.2.0**. The v2.5.0 client sends the signed payment in the `PAYMENT-SIGNATURE` header using a v2 payload structure. The v2.2.0 server's `extractPayment()` attempts to decode it via `decodePaymentSignatureHeader()`, but the payload format changed between versions — decode throws, the catch block silently returns `null`, and the server treats the request as "no payment attached" → returns 402 again.

```
Client (v2.5.0)                        Server (v2.2.0)
─────────────────                      ─────────────────
POST /analyze + PAYMENT-SIGNATURE ──►  extractPayment()
                                         ├─ decodePaymentSignatureHeader(header)
                                         ├─ THROWS (incompatible format)
                                         ├─ catch → console.warn → return null
                                         └─ "no payment" → respond 402
```

The `retry_http_request_with_x402` secondary error was Claude passing `{ original_response: {...} }` instead of the expected flat schema `{ url, method, body, selectedPaymentOption }` — a schema interpretation issue, not a code bug.

**Fix**: Updated `server/package.json` `@x402/*` from `^2.2.0` → `^2.5.0` (resolved to 2.7.0). Client v2.5.0 ↔ server v2.7.0 are fully compatible. After redeployment, the payment flow settles correctly.

### 6. ERC-8004 Agent Card Update (`update-services.js`)

`updateAgentCard(newCID)` was only passing 1 arg but the contract requires 2: `(string newCID, string[] newCapabilityTags)`. Fixed to read existing capability tags via `getAgentCapabilities()` and pass them through. Also added an IPFS fallback for when the gateway times out fetching the old card.

### 7. SCHEMA FIX (WethActionProvider_wrap_eth / "type: None" bug) in Onchain-agent

Root cause: `getVercelAITools()` returns plain objects with `parameters: JSONSchema`. Some AgentKit actions have schemas with `{ type: "None" }` which OpenAI rejects. AI SDK v5 reads `.parameters` (the JSON Schema) directly from the tool object to send to the API — it does NOT use `.inputSchema` for plain objects.

- Attempts that did NOT work:
   - ❌ Attempt 1: `setting parameters: { type: "object", properties: {} } on the object`
     → SDK cached or picked up the original; had no effect.
   
   -  ❌ Attempt 2: `tool({ inputSchema: z.object({}) }) wrapping`
     → tool() creates a new object with inputSchema but the SDK still reads .parameters; the new object either had no .parameters (undefined → error) or the old one leaked.

   -  ❌ Attempt 3: `tool({ description, inputSchema: emptyZod, execute })`
     → Same issue: SDK path for plain AgentKit tool objects reads .parameters, not .inputSchema.

- ✅ Correct fix: spread-replace the broken `.parameters` field DIRECTLY on the object.
{ ...tool, parameters: SAFE_SCHEMA }  where SAFE_SCHEMA = { type: "object", properties: {} }
This guarantees the object the SDK iterates over has a valid .parameters, full stop.

> Additionally: removed wethActionProvider + pythActionProvider from prepare-agentkit.ts (not used in Rachax402; both produce broken schemas).

### 8. Price $0.0001 vs $0.01 (update-services.js)

**Symptom**: discoverService returns "Price: $0.0001 USDC" but the server expects $0.01.

**Root cause**: The agent card on IPFS (source of truth for discovery) had `pricing.baseRate: 0.0001`. update-services.js only patched `endpoint`, not pricing.

**Fix**: update-services.js now patches `pricing.baseRate: 0.01` when updating the DataAnalyzer card. Run `node update-services.js --service=analyzer` and redeploy.

### 9. retry_http_request_with_x402 "Cannot read properties of undefined (reading 'network')"

**Symptom**: When make_http_request_with_x402 fails with 402, the retry tool crashes with `Cannot read properties of undefined (reading 'network')`.

**Root cause**: The retry schema expects `selectedPaymentOption` (one object from acceptablePaymentOptions). Claude was passing `previousResponse` instead. `args.selectedPaymentOption` was undefined → `.network` throws.

**Fix**: System prompt updated to instruct Claude: for retry, pass `url`, `method`, `body`, and `selectedPaymentOption` — pick ONE object from `acceptablePaymentOptions` (has scheme, network, asset, maxAmountRequired). Do NOT pass previousResponse.

### 10. "Payment was not settled" — Both facilitators support exact on eip155:84532 (Base Sepolia):

**Symptom**: X402ActionProvider returns `"Payment was not settled"` despite sufficient USDC. Service returns 402 again after client sends PAYMENT-SIGNATURE.

Facilitator	/supported	exact on eip155:84532
xpay	https://facilitator.xpay.sh/supported	Yes (v2)
x402.org	https://x402.org/facilitator/supported	Yes (v2)

- xpay kinds:

```
{"kinds":[
  {"x402Version":2,"scheme":"exact","network":"eip155:8453"},
  {"x402Version":2,"scheme":"exact","network":"eip155:84532"},
  {"x402Version":1,"scheme":"exact","network":"base"},
  {"x402Version":1,"scheme":"exact","network":"base-sepolia"}
]}
```

- x402.org kinds (relevant part):

```
{"kinds":[
  {"x402Version":2,"scheme":"exact","network":"eip155:84532"},
  ...
  {"x402Version":1,"scheme":"exact","network":"base-sepolia"},
  ...
]}
```

Both support exact on eip155:84532 in v2. Either facilitator should work for Base Sepolia; xpay is still a good default because it sponsors gas. [see here for details](./x402-payment-troubleshooting.md)
---

## On-Chain Contracts

| Contract | Address | Network |
|----------|---------|---------|
| ERC-8004 IdentityRegistry | `0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb` | Base Sepolia |
| ERC-8004 ReputationRegistry | `0x3FdD300147940a35F32AdF6De36b3358DA682B5c` | Base Sepolia |
| DataAnalyzer Agent | `0xEAB418143643557C74479d38E773A64E35B5f6c9` | Base Sepolia |
| StorachaStorage Agent | `0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8` | Base Sepolia |

## Key Files

| File | Purpose |
|------|---------|
| `app/api/agent/route.ts` | API route — streaming, heartbeat, file context, multi-turn memory |
| `app/api/agent/file-context.ts` | Server-side file store — avoids LLM re-generating base64 |
| `app/api/agent/create-agent.ts` | Agent singleton — system prompt, tool merging, schema sanitization |
| `app/api/agent/prepare-agentkit.ts` | AgentKit + CdpSmartWalletProvider setup |
| `app/api/agent/providers/erc8004Provider.ts` | ERC-8004 discovery + reputation tools |
| `app/api/agent/providers/storachaProvider.ts` | Storacha staging + paid store/retrieve tools |
| `app/hooks/useAgent.ts` | React hook — stream parsing (`0:` text, `b:` tool-call, `a:` tool-result) |
| `../mcp-server/src/index.ts` | MCP server entry — stdio transport, 8 tools |
| `../server/agentB-server.js` | DataAnalyzer x402-gated Express service |
| `../server/storacha-server.js` | StorachaStorage x402-gated Express service |
