import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchWithX402Payment } from "../lib/x402.js";

export function registerStorageTools(server: McpServer) {
  server.tool(
    "store_file",
    "Pay AgentB StorachaStorage via x402 and upload a file to IPFS. Requires the endpoint from discover_service('store'). Returns the file's CID and IPFS gateway URL.",
    {
      base64Data: z.string().describe("Base64-encoded file content"),
      filename: z.string().describe("Original filename with extension e.g. 'report.pdf'"),
      mimeType: z.string().default("application/octet-stream").describe("MIME type of the file"),
      endpoint: z.string().describe("StorachaStorage /upload endpoint URL from discover_service"),
    },
    async ({ base64Data, filename, mimeType, endpoint }) => {
      try {
        const buffer = Buffer.from(base64Data, "base64");
        const file = new File([buffer], filename, { type: mimeType });
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetchWithX402Payment(endpoint, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => `HTTP ${res.status}`);
          return { content: [{ type: "text" as const, text: `Upload failed (${res.status}): ${text}` }], isError: true };
        }

        const result = await res.json() as { data?: { cid?: string }; cid?: string };
        const cid = result?.data?.cid ?? result?.cid ?? "unknown";

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true, cid, filename,
              sizeBytes: buffer.length,
              ipfsUrl: `https://w3s.link/ipfs/${cid}`,
            }),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `store_file failed: ${msg}` }], isError: true };
      }
    }
  );

  server.tool(
    "retrieve_file",
    "Pay AgentB StorachaStorage via x402 and retrieve a file by CID. Requires the endpoint from discover_service('retrieve'). Returns the IPFS gateway URL and file metadata.",
    {
      cid: z.string().describe("IPFS CID of the file to retrieve"),
      endpoint: z.string().describe("StorachaStorage /retrieve endpoint URL from discover_service"),
    },
    async ({ cid, endpoint }) => {
      try {
        const url = `${endpoint}?cid=${encodeURIComponent(cid)}`;
        const res = await fetchWithX402Payment(url, { method: "GET" });

        if (!res.ok) {
          const text = await res.text().catch(() => `HTTP ${res.status}`);
          return { content: [{ type: "text" as const, text: `Retrieve failed (${res.status}): ${text}` }], isError: true };
        }

        const contentType = res.headers.get("content-type") || "application/octet-stream";
        const returnedCid = res.headers.get("X-CID") || cid;
        const arrayBuffer = await res.arrayBuffer();
        const sizeKb = (arrayBuffer.byteLength / 1024).toFixed(1);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              cid: returnedCid,
              contentType,
              sizeBytes: arrayBuffer.byteLength,
              ipfsUrl: `https://w3s.link/ipfs/${returnedCid}`,
              note: `Retrieved ${sizeKb}KB. Access via IPFS gateway URL.`,
            }),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `retrieve_file failed: ${msg}` }], isError: true };
      }
    }
  );
}
