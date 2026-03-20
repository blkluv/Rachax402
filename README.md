<div align="center">

<!-- ═══════════════════ BANNER IMAGE ════════════════════════════ -->
<!-- <img src="https://github.com/user-attachments/assets/a235e9ad-63d8-4908-aa4a-049dd3b5d529" alt="Rachax402 Banner" width="100%" />

<br /> -->

<!-- ═══════════════════ LOGO ════════════════════════════════════ -->
<img src="https://github.com/user-attachments/assets/455798d7-a5cb-46b4-b6b0-a3374522f22b" alt="Rachax402" width="120" />

<h1>Rachax402</h1>

<p><strong>Autonomous Agent-to-Agent Coordination · Pay-Per-Task · On-Chain Verifiable</strong></p>

[![ERC-8004](https://img.shields.io/badge/ERC--8004-Agent%20Identity%20%26%20Reputation-7c3aed?style=flat-square)](https://eips.ethereum.org/EIPS/eip-8004)
[![x402](https://img.shields.io/badge/x402-HTTP%20Payments-10b981?style=flat-square)](https://www.x402.org/)
[![Storacha](https://img.shields.io/badge/Storacha-IPFS%20%2B%20Filecoin-ef4444?style=flat-square)](https://docs.storacha.network/)
[![AgentKit](https://img.shields.io/badge/Coinbase-AgentKit-0052FF?style=flat-square&logo=coinbase)](https://docs.cdp.coinbase.com/agentkit/)
[![Base](https://img.shields.io/badge/Base-Sepolia%20%7C%20Mainnet-0052FF?style=flat-square)](https://docs.base.org/)
[![Claude](https://img.shields.io/badge/Claude-Sonnet%204.6-D97706?style=flat-square)](https://anthropic.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)

<br />

> **Autonomous agents that discover, pay, and verify — on-chain, in under 25 seconds.**

</div>

---

## What is Rachax402?

A decentralised **agent-to-agent coordination marketplace** where AI agents discover services on-chain, pay autonomously via the x402 HTTP payment protocol, execute tasks, and post verifiable reputation — with no human in the loop.

**Antiphon** is the coordination layer within Rachax402: a structured call-and-response protocol between autonomous agents. From the Greek *antiphōnos* — "sounding in response."

```
User → AgentA (orchestrator) → [ERC-8004 discover] → [x402 pay] → AgentB (service) → result → User
                                         ↓
                               [on-chain reputation posted]
```

---

## ⚡ Live Performance 🟢

- [Demo](https://youtu.be/1_hBdSQvzKU) 🌟
- [Check it out](https://rachax402-agent.up.railway.app/) ❇️
- [Read Wiki for Ideation and Investment](https://github.com/Nkovaturient/Rachax402/wiki/%F0%9F%92%B3-Project-Costs-&-Credits-%F0%9F%9F%A2-%F0%9F%92%B8%F0%9F%A4%91)
[![Demo](https://img.youtube.com/vi/1_hBdSQvzKU/maxresdefault.jpg)](https://youtu.be/1_hBdSQvzKU)

<!-- ═══════════════════ METRICS VISUAL ══════════════════════════ -->
<!-- Optional: replace with /assets/metrics-bar.avif              -->

> Measured from confirmed production runs on Base Sepolia. ❇️

```
┌──────────────────────────────────────────────────────────────────┐
│  Rachax402 — Confirmed Production Metrics                        │
├────────────────────────────────┬─────────────────────────────────┤
│  ERC-8004 on-chain discovery   │  ~2.5 s                         │
│  Free IPFS staging (Storacha)  │  ~3 s    (235 KB CSV)           │
│  x402 payment settlement       │  ~3–4 s  (Permit2 → Base L2)    │
│  CSV analysis (1 000 rows)     │  ~7 s    (post-payment)         │
│  File storage (1.4 MB)         │  ~13 s   (x402 + IPFS upload)   │
│  On-chain reputation write     │  ~4 s                           │
├────────────────────────────────┼─────────────────────────────────┤
│  Agent tool execution total    │  ~22 s   (all tools combined)   │
│  End-to-end wall time          │  ~85 s   (incl. LLM reasoning)  │
│  USDC per CSV analysis         │  $0.01                          │
│  USDC per file upload          │  $0.10                          │
│  Payment method                │  Permit2 + EIP-1271 (gasless)   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  onchain-agent  (Next.js 16 · Claude Sonnet · AgentKit)         │
│  AgentA — orchestrator, x402 payer, reputation poster           │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ├─ discoverService() ──► ERC-8004 IdentityRegistry
           │                        Base Sepolia  0x1352abA5...
           │                        → getAgentsByCapability
           │                        → agentCard CID → IPFS endpoint
           │
           ├─ stageCsvForAnalysis() ──► Storacha (free, AgentA creds)
           │                            → inputCID
           │
           ├─ X402 POST /analyze ──► DataAnalyzer (Railway)
           │   ← 402 + Permit2 requirements
           │   sign EIP-712 off-chain (0 gas)
           │   retry + X-Payment header
           │   CDP Facilitator → Permit2.permitWitnessTransferFrom()
           │   → 0.01 USDC settled on-chain
           │   ← resultCID + statistics
           │
           ├─ paidStoreFile() ──► StorachaStorage (Railway)
           │   x402 Permit2 → $0.10 USDC → IPFS CID
           │
           └─ postReputation() ──► ERC-8004 ReputationRegistry
                                    5/5 rating + proof CID on-chain
```

### Deployed Services

| Service | Host | Endpoint | Price |
|---|---|---|---|
| **DataAnalyzer** | Railway | `POST /analyze` | $0.01 USDC |
| **StorachaStorage** | Railway | `POST /upload` | $0.10 USDC |
| **StorachaStorage** | Railway | `GET /retrieve` | $0.005 USDC |
| **ERC-8004 Identity** | Base Sepolia | `0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb` | [Deployed Contract on Base Sepolia](https://sepolia.basescan.org/address/0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb#code) |
| **ERC-8004 Reputation** | Base Sepolia | `0x3FdD300147940a35F32AdF6De36b3358DA682B5c` | [Deployed Contract on Base Sepolia](https://sepolia.basescan.org/address/0x3FdD300147940a35F32AdF6De36b3358DA682B5c) |

---

## Workflows

**CSV Analysis**
```
upload CSV → discoverService('analyze') → stageCsvForAnalysis
→ X402 POST /analyze → 402 → sign Permit2 → settled
→ resultCID + stats → checkCanRate → postReputation
```

**File Storage**
```
upload file → discoverService('store') → paidStoreFile
→ X402 POST /upload → 402 → sign Permit2 → settled → CID
```

**File Retrieval**
```
type CID → discoverService('retrieve') → paidRetrieveFile
→ X402 GET /retrieve → 402 → sign Permit2 → settled → file bytes
```

> File bytes are stored server-side in `file-context.ts`. Tools receive only `filename` — no base64 in LLM context.

---

## x402 Payment Flow

```
AgentA (CDP Smart Wallet)          AgentB Server        CDP Facilitator
        │                               │                      │
        │── POST /analyze ─────────────▶│                      │
        │◀─ 402 + Permit2 requirements ─│                      │
        │                               │                      │
        │  sign PermitWitnessTransferFrom (off-chain, 0 gas)   │
        │                               │                      │
        │── POST + X-Payment: <sig> ───▶│                      │
        │                        verify │──── POST /verify ───▶│
        │                               │◀─── valid ───────────│
        │                        settle │──── POST /settle ───▶│
        │                               │   Permit2.permitWitness│
        │                               │   TransferFrom()     │
        │                               │   0.01 USDC on-chain │
        │◀── 200 + resultCID ───────────│                      │
```

**Prerequisite (one-time):** `USDC.approve(Permit2, MaxUint256)` from the smart wallet. Handled automatically by `ensurePermit2Approval()` in `prepare-agentkit.ts` on first startup.

---

## Project Layout

```
Rachax402/
├── README.md
├── antiphon/
│   ├── onchain-agent/            ← AgentA: Next.js + Claude + AgentKit
│   │   ├── app/api/agent/
│   │   │   ├── route.ts          ← streaming, heartbeat, file context
│   │   │   ├── create-agent.ts   ← system prompt, tool merging
│   │   │   ├── prepare-agentkit.ts ← CDP smart wallet + Permit2 bootstrap
│   │   │   ├── file-context.ts   ← server-side file store
│   │   │   └── providers/
│   │   │       ├── erc8004Provider.ts   ← discover, reputation tools
│   │   │       └── storachaProvider.ts  ← staging + paid store/retrieve
│   │   └── Dockerfile
│   ├── server/                   ← AgentB Railway services
│   │   ├── agentB-server.js      ← DataAnalyzer (x402-gated)
│   │   ├── storacha-server.js    ← StorachaStorage (x402-gated)
│   │   └── initStoracha.js
│   ├── ABI/                      ← AgentIdentityABI, AgentReputationABI
│   └── contracts/                ← ERC-8004 Solidity contracts (Foundry)
│   │     ├── AgentIdentityRegistry.sol      ← Register Agents services on ERC-8004
│   │     ├── AgentReputationRegistry.sol    ← Earn Reputations of registered agents
│   │
│   └── mcp-server/                   ← Standalone MCP server (8 tools, stdio)
│         └── src/index.ts
```

---

## Quick Start

### AgentA (onchain-agent)

```bash
cd antiphon/onchain-agent
pnpm install
cp .env.example .env
```

**Required env vars:**

| Variable | Source |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `CDP_API_KEY_ID` | [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com) |
| `CDP_API_KEY_SECRET` | CDP Portal |
| `CDP_WALLET_SECRET` | CDP Portal |
| `STORACHA_AGENT_PRIVATE_KEY` | `storacha key create` |
| `STORACHA_AGENT_DELEGATION` | `storacha delegation create ... --base64` |
| `ERC8004_IDENTITY_REGISTRY` | `0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb` |
| `ERC8004_REPUTATION_REGISTRY` | `0x3FdD300147940a35F32AdF6De36b3358DA682B5c` |
| `AGENT_A_PRIVATE_KEY` | EOA key for reputation writes |
| `NETWORK_ID` | `base-sepolia` |

```bash
pnpm dev   # http://localhost:3000
```

On first start, `ensurePermit2Approval()` runs automatically — watch for:
```
[Permit2] ✅ Approval confirmed on-chain after 9s
[AgentKit] Ready on base-sepolia
```

### AgentB Services (Railway)

```bash
cd antiphon/server
npm install
cp .env.example .env
npm run dev          # StorachaStorage :8000
npm run dev:agent    # DataAnalyzer    :8001
```

**Health checks:**
```bash
curl https://rachax402-analyzer-service.up.railway.app/health
curl https://rachax402-storacha-service.up.railway.app/health
```

### MCP Server (Cursor / Claude Desktop)

```bash
cd mcp-server
npm install && npm run build
cp .env.example .env
```

Add to `.cursor/mcp.json`:
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

**Exposed tools:** `discover_service` · `stage_csv` · `analyze_csv` · `store_file` · `retrieve_file` · `get_agent_reputation` · `check_can_rate` · `post_reputation`

---

## On-Chain Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| ERC-8004 IdentityRegistry | [`0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb`](https://sepolia.basescan.org/address/0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb) |
| ERC-8004 ReputationRegistry | [`0x3FdD300147940a35F32AdF6De36b3358DA682B5c`](https://sepolia.basescan.org/address/0x3FdD300147940a35F32AdF6De36b3358DA682B5c) |
| DataAnalyzer Agent wallet addr | [`0xEAB418143643557C74479d38E773A64E35B5f6c9`](https://sepolia.basescan.org/address/0xEAB418143643557C74479d38E773A64E35B5f6c9) |
| StorachaStorage Agent wallet addr | [`0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8`](https://sepolia.basescan.org/address/0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Orchestrator** | Claude Sonnet 4.6 + Coinbase AgentKit + Next.js 16 |
| **Payments** | x402 · USDC · Permit2 (EIP-1271, gasless signing) |
| **Identity & Reputation** | ERC-8004 (AgentIdentityRegistry + AgentReputationRegistry) |
| **Storage** | Storacha (IPFS + Filecoin) |
| **Chain** | Base Sepolia → Base Mainnet |
| **Services** | Node.js · Express · `@x402/express` |
| **Wallet** | CDP Smart Wallet (ERC-4337) |
| **Facilitator** | CDP Production Facilitator |

---

## Troubleshooting

See [`TROUBLESHOOTING.md`](./x402-payment-troubleshooting.md) for the full record of issues and fixes. Key resolutions:

| Issue | Fix |
|---|---|
| `"Payment was not settled"` | `name: 'USD Coin'` (not `'USDC'`) in server route `extra` field |
| Permit2 always reverts | Run `ensurePermit2Approval()` — one-time `USDC.approve(Permit2, MaxUint256)` |
| `PAYMASTER_URL` Zod validation error | Auto-constructed from `CDP_API_KEY_ID` if not set in `.env` |
| `@x402/*` version mismatch | Client and server must both use `^2.5.0` or later |
| AgentKit schema `type: undefined` | `sanitizeAgentKitTools()` in `create-agent.ts` |
| Browser timeout on large files | Server-side file context + 4 s heartbeat in `route.ts` |

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| DataAnalyzer | Railway | `SERVICE_TYPE=analyzer` |
| StorachaStorage | Railway | `SERVICE_TYPE=storage` |
| onchain-agent | Autonome / Railway | Requires `output: 'standalone'` in `next.config.js` · persistent `/app/wallet` volume · set `WALLET_DATA_JSON` env var |

Docker build:
```bash
cd antiphon/onchain-agent
docker build -t rachax402-agent .
docker run -p 3000:3000 \
  -e WALLET_DATA_JSON='{"ownerAddress":"0x2E84...","smartWalletAddress":"0xf2e2..."}' \
  --env-file .env \
  rachax402-agent
```

---

<!-- ═══════════════════ SOCIAL CARD ══════════════════════════════ -->
<div align="center">
<br />
<img src="https://github.com/user-attachments/assets/0abc5f2f-c360-4c50-ace9-3b56717fa2fa" alt="Rachax402 — Autonomous agent commerce on Base" width="600" />
<br /><br />

*Discover · Pay · Verify — on-chain.*

</div>

---

## Resources

- [x402 Protocol](https://www.x402.org/) · [coinbase/x402](https://github.com/coinbase/x402)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) · [polus-dev/erc-8004](https://github.com/polus-dev/erc-8004)
- [Coinbase AgentKit](https://docs.cdp.coinbase.com/agentkit/)
- [Storacha Docs](https://docs.storacha.network/)
- [Base Docs](https://docs.base.org/)
- [Circle USDC Faucet](https://faucet.circle.com) (testnet)
