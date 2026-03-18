# ── Rachax402 onchain-agent — Production Dockerfile ────────────────────────────
#
# REQUIREMENTS before building:
#   next.config.js MUST contain:  output: 'standalone'
#
# WALLET PERSISTENCE:
#   Set WALLET_DATA_JSON env var in Railway/Autonome to reuse an existing wallet:
#   WALLET_DATA_JSON={"ownerAddress":"0x2E84...","smartWalletAddress":"0xf2e2..."}
#   entrypoint.sh writes it to /app/wallet/wallet_data.txt on first boot.
#
# BUILD:   docker build -t rachax402-agent .
# ────────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Native module build tools (bigint bindings, secp256k1, etc.)
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json* .npmrc* ./

# Always npm. pnpm-lock.yaml in this repo is stale — do not use it.
RUN npm install --legacy-peer-deps

# ── Stage 2: Build Next.js app ─────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder values prevent build-time crashes from missing runtime secrets.
ENV ANTHROPIC_API_KEY=build-placeholder
ENV CDP_API_KEY_ID=build-placeholder
ENV CDP_API_KEY_SECRET=build-placeholder

# Required so serverExternalPackages in next.config.js is respected.
# (--no-turbopack flag was removed in Next.js 16)
RUN npm run build

# Fail fast if next.config.js is missing  output: 'standalone'
RUN test -f .next/standalone/antiphon/onchain-agent/server.js || \
    (echo "ERROR: .next/standalone/antiphon/onchain-agent/server.js not found." && \
     echo "Add  output: 'standalone'  to next.config.js and rebuild." && exit 1)

# ── Stage 3: Production runner ─────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/public                                    ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/antiphon/onchain-agent   ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/node_modules             ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/static                              ./.next/static

# Wallet persistence directory (seeded by entrypoint.sh from WALLET_DATA_JSON)
RUN mkdir -p /app/wallet && chown nextjs:nodejs /app/wallet

# Symlink so prepare-agentkit.ts finds wallet_data.txt at the expected CWD path
RUN ln -s /app/wallet/wallet_data.txt /app/wallet_data.txt

# Entrypoint: seeds wallet on first boot, then execs node server.js
COPY --chown=nextjs:nodejs entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["/app/entrypoint.sh"]