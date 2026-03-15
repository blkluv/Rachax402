/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker standalone output (Autonome deployment)
  output: "standalone",

  // Allow large base64 file uploads in API routes (50MB body limit)
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },

};

export default nextConfig;