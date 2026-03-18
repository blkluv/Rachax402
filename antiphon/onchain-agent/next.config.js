/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone output (Railway / Autonome deployment)
  output: "standalone",

  // Allow large base64 file uploads in API routes (50MB body limit)
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

  // ── Server-only packages ─────────────────────────────────────────────────────
  // These packages use Node.js APIs (fs, crypto, net, wasm, native bindings)
  // that cannot be bundled by Webpack/Turbopack during `next build`.
  // Listing them here tells Next.js to leave them as bare `require()`/`import()`
  // calls at runtime and load them directly from node_modules instead.
  //
  // Without this, `npm run build` fails with "module not found" for:
  //   storachaProvider.ts  → @storacha/client, @x402/fetch, @x402/evm
  //   create-agent.ts      → @coinbase/agentkit, @coinbase/agentkit-vercel-ai-sdk
  //   agentkit internals   → @solana-program/token (transitive dep)
  serverExternalPackages: [
    // Storacha / IPFS
    "@storacha/client",
    "@storacha/upload-client",
    "@storacha/filecoin-client",
    "@storacha/capabilities",
    "@ucanto/core",
    "@ucanto/client",
    "@ucanto/interface",
    "@ucanto/principal",
    "@ucanto/transport",

    // x402 payment protocol
    "@x402/fetch",
    "@x402/evm",
    "@x402/core",
    "@x402/express",

    // Coinbase AgentKit + CDP
    "@coinbase/agentkit",
    "@coinbase/agentkit-vercel-ai-sdk",
    "@coinbase/cdp-sdk",
    "@coinbase/x402",

    // Solana transitive deps from agentkit (not used, but present in node_modules)
    "@solana-program/token",
    "@solana-program/system",
    "@solana/web3.js",
    "@solana/spl-token",
    "solana",

    // Viem / ethers — use Node.js crypto
    "viem",
    "ethers",
  ],
};

export default nextConfig;