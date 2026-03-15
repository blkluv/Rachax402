import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getStorachaClient } from "../lib/storacha.js";
import { fetchWithX402Payment } from "../lib/x402.js";

export function registerAnalyzeTools(server: McpServer) {
  server.tool(
    "stage_csv",
    "Upload a CSV file to Storacha IPFS for FREE to get an inputCID. Required before calling analyze_csv — the analyzer needs a CID, not raw bytes. Uses the MCP server's own Storacha credentials (no payment).",
    {
      base64CsvData: z.string().describe("Base64-encoded CSV content"),
      filename: z.string().describe("Original filename e.g. 'sales-data.csv'"),
    },
    async ({ base64CsvData, filename }) => {
      try {
        const client = await getStorachaClient();
        const buffer = Buffer.from(base64CsvData, "base64");
        const file = new File([buffer], filename, { type: "text/csv" });

        const cid = await client.uploadFile(file);
        const cidStr = cid.toString();

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              inputCID: cidStr,
              filename,
              sizeBytes: buffer.length,
              ipfsUrl: `https://w3s.link/ipfs/${cidStr}`,
            }),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Storacha staging failed: ${msg}` }], isError: true };
      }
    }
  );

  server.tool(
    "analyze_csv",
    "Pay the DataAnalyzer service via x402 and submit a CSV for statistical analysis. Requires an inputCID from stage_csv and the endpoint URL from discover_service. Returns resultCID with analysis stats and insights.",
    {
      endpoint: z.string().describe("DataAnalyzer /analyze endpoint URL from discover_service"),
      inputCID: z.string().describe("IPFS CID of the staged CSV from stage_csv"),
      requirements: z.string().default("statistical analysis").describe("Analysis focus area"),
    },
    async ({ endpoint, inputCID, requirements }) => {
      try {
        const res = await fetchWithX402Payment(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputCID, requirements }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => `HTTP ${res.status}`);
          return { content: [{ type: "text" as const, text: `Analysis request failed (${res.status}): ${text}` }], isError: true };
        }

        const result = await res.json();
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `analyze_csv failed: ${msg}` }], isError: true };
      }
    }
  );
}
