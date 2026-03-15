FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy .npmrc first so npm respects legacy-peer-deps during install
COPY .npmrc* ./
COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile --legacy-peer-deps

# ── Build stage ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Production stage ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# wallet_data.txt is stored in a dedicated directory so we can mount
# a volume at /app/wallet — Docker VOLUME on a FILE path creates a
# directory instead (Docker limitation). Mount: -v /host/dir:/app/wallet
RUN mkdir -p /app/wallet && chown nextjs:nodejs /app/wallet

# Symlink so prepare-agentkit.ts finds wallet_data.txt at the expected path
RUN ln -s /app/wallet/wallet_data.txt /app/wallet_data.txt || true

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Wallet persistence: mount a host directory at /app/wallet
# Autonome: set WALLET_DATA_DIR=/app/wallet in agent config, or mount volume
VOLUME ["/app/wallet"]

# Health: GET / returns Next.js HTML (always 200 when server is up)
# /api/agent is POST-only — wget to it would 405
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# FIX: Next.js standalone build produces server.js at the workdir root.
# Previous CMD ["node", "app/api/agent/create-agent.ts"] was wrong:
#   1. node cannot execute .ts files
#   2. create-agent.ts is a module, not an HTTP server entry point
CMD ["node", "server.js"]