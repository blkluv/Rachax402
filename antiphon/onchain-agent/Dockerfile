# ── Rachax402 onchain-agent — Production Dockerfile ────────────────────────────
#
# REQUIREMENTS before building:
#   next.config.js MUST contain:  output: 'standalone'
#   Without this, .next/standalone won't exist and the runner stage will be empty.
#
# WALLET PERSISTENCE (critical — read this):
#   wallet_data.txt holds the smart wallet address. If it's lost between restarts,
#   AgentKit creates a NEW wallet, losing all USDC and the Permit2 allowance.
#
#   Option A — env var (Autonome / Railway recommended):
#     Set WALLET_DATA_JSON='{"ownerAddress":"0x2E84...","smartWalletAddress":"0xf2e2..."}'
#     The entrypoint writes it to /app/wallet/wallet_data.txt on first boot.
#     No volume needed. Simplest for Autonome where volumes are harder to configure.
#
#   Option B — volume mount (Docker / Railway volumes):
#     Mount a host directory or named volume to /app/wallet
#     Place wallet_data.txt inside that directory before first boot.
#     docker run -v /host/wallet:/app/wallet rachax402-agent
#
#   Option C — both (recommended for production):
#     Set WALLET_DATA_JSON as env var AND mount /app/wallet.
#     The entrypoint seeds from env if file absent; volume persists new wallets.
#
# BUILD:
#   docker build -t rachax402-agent .
#
# RUN (minimal):
#   docker run -p 3000:3000 \
#     -e ANTHROPIC_API_KEY=sk-ant-... \
#     -e CDP_API_KEY_ID=... \
#     -e CDP_API_KEY_SECRET=... \
#     -e CDP_WALLET_SECRET=... \
#     -e STORACHA_AGENT_PRIVATE_KEY=... \
#     -e STORACHA_AGENT_DELEGATION=... \
#     -e ERC8004_IDENTITY_REGISTRY=0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb \
#     -e ERC8004_REPUTATION_REGISTRY=0x3FdD300147940a35F32AdF6De36b3358DA682B5c \
#     -e AGENT_A_PRIVATE_KEY=0x... \
#     -e WALLET_DATA_JSON='{"ownerAddress":"0x2E84...","smartWalletAddress":"0xf2e2..."}' \
#     -e NETWORK_ID=base-sepolia \
#     rachax402-agent
# ────────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Native module build tools (bigint bindings, secp256k1, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

# Detect package manager: use pnpm if pnpm-lock.yaml present, else npm
COPY package.json pnpm-lock.yaml* package-lock.json* .npmrc* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && \
      pnpm install --frozen-lockfile; \
    else \
      npm ci --frozen-lockfile --legacy-peer-deps; \
    fi

# ── Stage 2: Build Next.js app ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# Copy the full project (includes ABI/, app/, public/, next.config.js, etc.)
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Prevent build-time errors from missing runtime secrets.
# These are only needed at RUNTIME, not during next build.
ENV ANTHROPIC_API_KEY=build-placeholder
ENV CDP_API_KEY_ID=build-placeholder
ENV CDP_API_KEY_SECRET=build-placeholder

RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && pnpm run build; \
    else \
      npm run build; \
    fi

# Verify standalone output was produced (fail fast if next.config.js lacks output:'standalone')
RUN test -f .next/standalone/server.js || \
    (echo "ERROR: .next/standalone/server.js not found." && \
     echo "Add  output: 'standalone'  to next.config.js and rebuild." && exit 1)

# ── Stage 3: Production runner ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Static assets
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

# Persistent wallet directory — mount a volume here OR seed via WALLET_DATA_JSON
RUN mkdir -p /app/wallet && chown nextjs:nodejs /app/wallet

# Symlink: prepare-agentkit.ts writes to "wallet_data.txt" (CWD-relative = /app/wallet_data.txt)
# The symlink redirects writes into the persistent volume directory.
RUN ln -s /app/wallet/wallet_data.txt /app/wallet_data.txt

# ── Entrypoint script ─────────────────────────────────────────────────────────
# entrypoint.sh lives alongside this Dockerfile in the build context.
# It seeds wallet_data.txt from WALLET_DATA_JSON on first boot, then execs node server.js.
# Written as a separate file (not a RUN heredoc) to avoid Dockerfile linter false-positives
# where lines inside heredocs are mis-parsed as Dockerfile instructions (SET, IF, EXEC, etc.)
COPY --chown=nextjs:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh


USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Mount volume here for wallet persistence (Option B/C)
VOLUME ["/app/wallet"]

# Health check: GET / returns 200 when Next.js is up (node-based, no wget dep)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["/app/entrypoint.sh"]