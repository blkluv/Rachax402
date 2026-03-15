import type { Address } from "viem";

export const IDENTITY_REGISTRY = (process.env.ERC8004_IDENTITY_REGISTRY || "0x1352abA587fFbbC398d7ecAEA31e2948D3aFE4Fb") as Address;
export const REPUTATION_REGISTRY = (process.env.ERC8004_REPUTATION_REGISTRY || "0x3FdD300147940a35F32AdF6De36b3358DA682B5c") as Address;
export const RPC_URL = process.env.BASE_RPC_URL || "https://sepolia.base.org";

export const CAPABILITY_MAP: Record<string, { tag: string; endpointSuffix: string; pricingKey: string }> = {
  analyze: { tag: "csv-analysis", endpointSuffix: "/analyze", pricingKey: "baseRate" },
  store: { tag: "file-storage", endpointSuffix: "/upload", pricingKey: "upload" },
  retrieve: { tag: "file-storage", endpointSuffix: "/retrieve", pricingKey: "retrieve" },
};
