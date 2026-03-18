import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone output (Railway / Autonome deployment)
  output: "standalone",

  // Pin tracing root to this package — prevents Next.js from inferring the wrong
  // workspace root when pnpm-lock.yaml exists in a parent directory.
  // Without this, standalone output may be incomplete.
  outputFileTracingRoot: path.join(__dirname, "../../"),

  // Allow large file uploads in API routes
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // ── Server-only packages ─────────────────────────────────────────────────────
  // Webpack skips bundling these and loads them from node_modules at runtime.
  // Required for packages using Node.js crypto / fs / wasm / native bindings.
  // "build" script uses --webpack so Turbopack (which ignores this) is not used.
  // Subpath imports must be listed individually — Webpack does not auto-cover them.
  serverExternalPackages: [
    // Storacha — root + subpaths used in storachaProvider.ts
    "@storacha/client",
    "@storacha/client/stores/memory",
    "@storacha/client/proof",
    "@storacha/client/principal/ed25519",
    "@storacha/upload-client",
    "@storacha/filecoin-client",
    "@storacha/capabilities",

    // ucanto stack (Storacha internals)
    "@ucanto/core",
    "@ucanto/client",
    "@ucanto/interface",
    "@ucanto/principal",
    "@ucanto/transport",

    // x402 payment protocol
    "@x402/fetch",
    "@x402/evm",
    "@x402/evm/exact/client",
    "@x402/core",
    "@x402/core/server",
    "@x402/express",

    // Coinbase AgentKit + CDP
    "@coinbase/agentkit",
    "@coinbase/agentkit-vercel-ai-sdk",
    "@coinbase/cdp-sdk",
    "@coinbase/x402",

    // Solana transitive deps from agentkit
    "@solana-program/token",
    "@solana-program/system",
    "@solana/web3.js",
    "@solana/spl-token",

    // Viem / ethers — use Node.js crypto
    "viem",
    "viem/accounts",
    "viem/chains",
    "ethers",
  ],
};

export default nextConfig;