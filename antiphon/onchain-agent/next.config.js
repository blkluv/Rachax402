/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone output (Railway / Autonome deployment)
  output: "standalone",

  // Allow large base64 file uploads in API routes
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // ── Server-only packages ─────────────────────────────────────────────────────
  // Tells Webpack NOT to bundle these — load them from node_modules at runtime.
  // Required because these packages use Node.js crypto/fs/wasm/native bindings
  // that cannot be statically bundled.
  //
  // IMPORTANT: This only works with Webpack. The Dockerfile uses
  //   npx next build --no-turbopack
  // to force Webpack. Turbopack ignores serverExternalPackages entirely.
  //
  // Subpath imports (e.g. @storacha/client/proof) must be listed separately —
  // Webpack does not automatically cover subpaths when only the root is listed.
  serverExternalPackages: [
    // Storacha — root + all used subpaths
    "@storacha/client",
    "@storacha/client/stores/memory",
    "@storacha/client/proof",
    "@storacha/client/principal/ed25519",
    "@storacha/upload-client",
    "@storacha/filecoin-client",
    "@storacha/capabilities",

    // ucan / ucanto stack (Storacha internals)
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

    // Solana — transitive deps from agentkit (not used directly)
    "@solana-program/token",
    "@solana-program/system",
    "@solana/web3.js",
    "@solana/spl-token",
    "solana",

    // Viem + ethers — use Node.js crypto module
    "viem",
    "viem/accounts",
    "viem/chains",
    "ethers",
  ],
};

export default nextConfig;