# Rachax402 AgentB Services

> x402-payment-gated DataAnalyzer + StorachaStorage with on-chain Bazaar discovery. 

- Two Express servers, one Docker image, deployed as two independent Railway services. Discovered by AgentA via ERC-8004 on Base Sepolia.

---

## Services

| Service | File | Port | Price |
|---|---|---|---|
| StorachaStorage | `storacha-server.js` | 8000 | $0.1 upload · $0.005 retrieve |
| DataAnalyzer | `agentB-server.js` | 8001 | $0.01 / CSV analysis |

---

## Local Development

```bash
npm install

# StorachaStorage only
npm run dev

# DataAnalyzer only (separate terminal)
npm run dev:agent

# Both (dev only — concurrently is a devDependency, not in Docker)
npm run dev:both
```

---

## Environment Variables

```bash
cp .env.example .env
```

**StorachaStorage:**
```
PORT=8000
RECIPIENT_ADDRESS=0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8
STORACHA_AGENT_PRIVATE_KEY=   # from: storacha key create
STORACHA_AGENT_DELEGATION=    # from: storacha delegation create ... --base64
FACILITATOR_URL=https://x402.org/facilitator
BASE_RPC_URL=https://sepolia.base.org
```

**DataAnalyzer:**
```
PROVIDER_PORT=8001
PROVIDER_WALLET_ADDRESS=0xEAB418143643557C74479d38E773A64E35B5f6c9
STORACHA_AGENT_PRIVATE_KEY=   # same or separate storacha creds
STORACHA_AGENT_DELEGATION=
FACILITATOR_URL=https://x402.org/facilitator
BASE_RPC_URL=https://sepolia.base.org
```

**Get Storacha credentials:**
```bash
npm install -g @storacha/cli
storacha login
storacha space create rachax402-storage
storacha key create
# → copy output as STORACHA_AGENT_PRIVATE_KEY
storacha delegation create <AgentDID> \
  --can 'upload/add' \
  --can 'space/blob/add' \
  --can 'space/index/add' \
  --can 'filecoin/offer' \
  --base64
# → copy output as STORACHA_AGENT_DELEGATION
```

---

## Docker

The Dockerfile calls `node` directly via `SERVICE_TYPE` — never `npm start`.
(`npm start` uses `concurrently` which is a devDependency and not installed in the image.)

```bash
docker build -t rachax402-server .

# Test StorachaStorage
docker run --env-file .env -e SERVICE_TYPE=storage -p 8000:8000 rachax402-server

# Test DataAnalyzer
docker run --env-file .env -e SERVICE_TYPE=analyzer \
  -e PROVIDER_PORT=8001 -p 8001:8001 rachax402-server
```

---

## Railway Deployment

Two services, same repo, same root (`antiphon/server/`).

**Service 1 — StorachaStorage:**
```
SERVICE_TYPE=storage
PORT=8000
RECIPIENT_ADDRESS=0x9D48b65Bb45f144CBC5662Fd3Fd011659371D0f8
FACILITATOR_URL=https://x402.org/facilitator
BASE_RPC_URL=https://sepolia.base.org
STORACHA_AGENT_PRIVATE_KEY=...
STORACHA_AGENT_DELEGATION=...
```

**Service 2 — DataAnalyzer:**
```
SERVICE_TYPE=analyzer
PORT=8001
PROVIDER_PORT=8001
PROVIDER_WALLET_ADDRESS=0xEAB418143643557C74479d38E773A64E35B5f6c9
FACILITATOR_URL=https://x402.org/facilitator
BASE_RPC_URL=https://sepolia.base.org
STORACHA_AGENT_PRIVATE_KEY=...
STORACHA_AGENT_DELEGATION=...
```

After both services deploy, update ERC-8004 agent cards so AgentA discovers the Railway URLs:
```bash
ANALYZER_URL=https://rachax402-analyzer-service.up.railway.app \
STORAGE_URL=https://rachax402-storacha-service.up.railway.app \
node update-agent-cards.js
```

Verify:
```bash
curl https://rachax402-analyzer-service.up.railway.app/health
curl https://rachax402-storacha-service.up.railway.app/health
```

---

## API

### POST /upload — $0.1
```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@data.csv" \
  -H "X-PAYMENT: <proof>"
```
→ `{ status: "success", data: { cid, filename, size, url } }`

### GET /retrieve?cid=... — $0.005
```bash
curl "http://localhost:8000/retrieve?cid=bafkrei..." \
  -H "X-PAYMENT: <proof>"
```
→ raw file bytes + `X-CID` header

### POST /analyze — $0.01
```bash
curl -X POST http://localhost:8001/analyze \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: <proof>" \
  -d '{"inputCID":"bafkrei...","requirements":"statistical summary"}'
```
→ `{ resultCID, summary, statistics, insights }`

### GET /health — free
```bash
curl http://localhost:8000/health
curl http://localhost:8001/health
```

---

## How AgentA Discovers These Services

AgentA has no hardcoded Railway URLs. The discovery chain:

1. `discoverService('analyze')` → queries `ERC-8004 IdentityRegistry` on Base Sepolia
2. `getAgentsByCapability("csv-analysis")` → `[0xEAB418...]`
3. `getAgentCard(0xEAB418...)` → IPFS CID
4. Fetch `https://w3s.link/ipfs/<CID>` → `{ endpoint: "https://...railway.app/analyze" }`
5. `x402ActionProvider.fetchWithPayment(endpoint, ...)` → payment → response

---

## Troubleshooting

| Error | Fix |
|---|---|
| `sh: concurrently: not found` | Docker CMD must call `node` directly, not `npm start` |
| `Cannot find module 'papaparse'` | Add `papaparse` to `dependencies` (not devDependencies) |
| `RECIPIENT_ADDRESS is undefined` | Set the env var in Railway Variables panel |
| `402` but payment fails | Wallet needs test USDC — faucet: https://faucet.circle.com |
| Analyzer 502 or SIGTERM on Railway | See **Railway PORT vs PROVIDER_PORT** below |
| Storacha upload fails | Delegation must include `upload/add` and `space/blob/add` |

**Railway PORT vs PROVIDER_PORT** — Railway injects `PORT` and routes traffic (and health checks) to it. The analyzer must listen on `PORT` when set. In code we use `PORT || PROVIDER_PORT || 8001`: on Railway the app binds to Railway’s `PORT`, so 502 and health-check SIGTERM go away. You can leave `PROVIDER_PORT` in Railway config; it’s only used when `PORT` is unset (e.g. local dev).

## 🌐 Going to Mainnet

1. Change network to `eip155:8453` (Base mainnet)
2. Update `RECIPIENT_ADDRESS` to your mainnet wallet
3. Ensure wallet has USDC for gas
4. Test thoroughly first!

## 📚 More Info

- [x402 Docs](https://x402.gitbook.io/x402) - Protocol docs
- [Storacha Docs](https://docs.storacha.network) - Storage docs
- [Bazaar Discovery](https://x402.gitbook.io/x402/core-concepts/bazaar-discovery-layer) - Discovery layer

---

Built with ❤️ using x402 + Storacha