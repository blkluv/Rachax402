# x402 Payment Troubleshooting — Rachax402

A structured record of every issue encountered getting AgentA → AgentB x402 payments working end-to-end on Base Sepolia. Useful for anyone setting up a new agent or service in this stack.

---

## The Stack

| Component | Role |
|---|---|
| AgentA (Next.js + AgentKit) | Orchestrator — discovers services, pays via x402, posts reputation |
| agentB-server (Railway) | DataAnalyzer — CSV analysis, x402-gated at `/analyze` |
| storacha-server (Railway) | StorachaStorage — IPFS upload/retrieve, x402-gated |
| CDP Smart Wallet | AgentA's wallet — holds USDC, signs Permit2 via EIP-1271 |
| CDP Facilitator | Verifies signatures + calls Permit2 on-chain to settle payment |

---

## Issues Found and Fixed

---

### 1 — `name: 'USDC'` must be `name: 'USD Coin'`
**Symptom:** Every payment attempt returned `"Payment was not settled"` regardless of wallet balance.

**Root cause:** The CDP facilitator's `settle()` validates the EIP-712 domain `name` field against the USDC contract's on-chain `name()` return value, which is `"USD Coin"` — not `"USDC"`. Any mismatch causes `invalid_payload` and settlement fails silently.

**Fix — `agentB-server.js` and `storacha-server.js`:**
```js
// ❌ Wrong
extra: { assetTransferMethod: 'permit2', name: 'USDC', version: '2' }

// ✅ Correct
extra: { assetTransferMethod: 'permit2', name: 'USD Coin', version: '2' }
```
This applies to every route in both servers (`POST /analyze`, `POST /upload`, `GET /retrieve`).

---

### 2 — Missing Permit2 allowance (root cause of persistent 402s)
**Symptom:** Signature was valid, wallet had 11 USDC, but every settlement still returned `"Payment was not settled"`.

**Root cause:** x402 `permit2` mode works by having the CDP facilitator call `Permit2.permitWitnessTransferFrom()` on-chain. Permit2 requires that the token owner (`0xf2e2...`, the smart wallet) has previously called `USDC.approve(Permit2, MaxUint256)`. Without this one-time on-chain approval, every Permit2 call reverts — the signature is valid but Permit2 has no permission to move tokens.

The `@x402/evm` client has two auto-approval paths to fix this automatically, but both are blocked with `CdpSmartWalletProvider`:
- `eip2612GasSponsoring` — requires the server to advertise this extension; CDP facilitator does not.
- `erc20ApprovalGasSponsoring` — requires `signTransaction`; `CdpSmartWalletProvider` throws on raw tx signing.

**Fix — `prepare-agentkit.ts`:** Added `ensurePermit2Approval()` which runs at startup:
1. Reads `USDC.allowance(smartWallet, Permit2)` via public RPC
2. If `> 0` → returns immediately (fast path, no gas, instant on all subsequent restarts)
3. If `== 0` → sends `USDC.approve(Permit2, MaxUint256)` as an ERC-4337 user operation, polls for confirmation up to 90 s

---

### 3 — `PAYMASTER_URL` required for `sendTransaction` on `CdpSmartWalletProvider`
**Symptom:** `ensurePermit2Approval` crashed with `"must be a valid HTTP or HTTPS URL with at least 11 characters"`, crashing the entire AgentKit init.

**Root cause:** The CDP SDK's `sendUserOperation` validates `paymasterUrl` with Zod. If `PAYMASTER_URL` is not set in `.env`, the value is `undefined`, which fails Zod validation before the request is even made.

**Fix — `prepare-agentkit.ts`:** Auto-construct the paymaster URL from the existing `CDP_API_KEY_ID` if `PAYMASTER_URL` is not in `.env`. The CDP RPC endpoint is free for testnet user operations:

```ts
const paymasterUrl =
  process.env.PAYMASTER_URL ||
  `https://api.developer.coinbase.com/rpc/v1/${networkId}/${process.env.CDP_API_KEY_ID}`;
```

This is passed to both `configureWithWallet` and used inside `ensurePermit2Approval`. No `.env` change required — it works automatically.

Additionally, the approval failure was made **non-fatal**: if the userOp send fails for any transient reason, AgentKit starts normally and logs a clear warning with the exact `.env` line to add. This prevents a crash loop.

---

### 4 — Propagation delay: signature verified before CDP facilitator can see it
**Symptom:** Occasional `"Payment was not settled"` even after fixes 1–3 in rapid retry scenarios (x402 Issue #1065).

**Root cause:** The CDP facilitator needs ~1 s after the client signs the Permit2 message before it can verify the signature. If the server passes it to the facilitator immediately on receipt, the facilitator may not yet recognise it.

**Fix — `agentB-server.js` and `storacha-server.js`:** Added a 1200 ms delay before the payment middleware processes any request that carries a payment header:

```js
const _rawPaymentMiddleware = paymentMiddleware(routes, resourceServer, undefined, undefined, false);
app.use((req, res, next) => {
  const hasPayment = !!(req.headers['x-payment'] || req.headers['payment']);
  if (hasPayment) {
    setTimeout(() => _rawPaymentMiddleware(req, res, next), 1200);
  } else {
    _rawPaymentMiddleware(req, res, next);
  }
});
```

Health check and 402-probe requests (no payment header) are unaffected.

---

### 5 — Smart wallet address override in `storachaProvider.ts`
**Symptom:** `paidStoreFile` / `paidRetrieveFile` could potentially use the wrong wallet address for Permit2 signing.

**Root cause:** `walletProvider.toSigner()` (inherited from `EvmWalletProvider`) correctly uses `getAddress()` as the `address` field, which for `CdpSmartWalletProvider` returns the smart wallet address. However, this relies on the inherited behaviour staying consistent. To make it explicit and safe:

**Fix — `storachaProvider.ts`:** Explicitly override `signer.address` with `walletProvider.getAddress()` (the smart wallet) before passing to `toClientEvmSigner`, documenting exactly why:

```ts
const smartWalletAddress = walletProvider.getAddress() as `0x${string}`;
const signerForSmartWallet = { ...signer, address: smartWalletAddress };
const clientEvmSigner = toClientEvmSigner(signerForSmartWallet as typeof signer, publicClient);
```

---

## Summary Checklist for New Deployments

- [ ] Both servers: `extra.name = 'USD Coin'` (not `'USDC'`) in every route's `accepts` array
- [ ] `prepare-agentkit.ts` includes `ensurePermit2Approval()` — runs at startup, idempotent
- [ ] `PAYMASTER_URL` in `.env` **or** auto-constructed from `CDP_API_KEY_ID` (handled automatically)
- [ ] Both servers: propagation delay wrapper on payment middleware (1200 ms)
- [ ] Smart wallet (`0xf2e2...`) holds USDC — use Circle testnet faucet: https://faucet.circle.com
- [ ] Smart wallet has ETH for gas — use CDP faucet or set `PAYMASTER_URL` for sponsored ops

## Working Payment Flow (confirmed)

```
[Permit2] ✅ Allowance already set — skipping approval.
[AgentKit] Ready on base-sepolia
→ stageCsvForAnalysis       (free, Storacha)
→ discoverService           (on-chain ERC-8004 lookup)
→ make_http_request         (probe → 402 returned)
→ retry_http_request_with_x402  (Permit2 signed → CDP facilitator → on-chain USDC transfer)
← status: success, resultCID: bafkrei...
→ postReputation            (on-chain 5/5 rating with proof CID)
```