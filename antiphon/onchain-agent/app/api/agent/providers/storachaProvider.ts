// /**
//  * storachaProvider.ts
//  * Vercel AI SDK tools for AgentA's own Storacha client — free data transport.
//  *
//  * This is NOT the paid storacha-server.js service.
//  * This is AgentA's own Storacha credentials used to stage CSV files for free
//  * before sending them to the DataAnalyzer via x402.
//  *
//  * Tools exposed to Claude:
//  *   stageCsvForAnalysis(base64CsvData, filename) → inputCID  [primary tool]
//  *   uploadToStoracha(base64Data, filename, mimeType) → CID   [generic upload]
//  *
//  * Usage in create-agent.ts:
//  *   import { getStorachaTools } from "./providers/storachaProvider";
//  *   tools: { ...getVercelAITools(agentkit), ...getERC8004Tools(), ...getStorachaTools() }
//  */

// import { tool } from "ai";
// import { z } from "zod";
// import * as Client from "@storacha/client";
// import { StoreMemory } from "@storacha/client/stores/memory";
// import * as Proof from "@storacha/client/proof";
// import { Signer } from "@storacha/client/principal/ed25519";

// // ── Lazy singleton Storacha client ────────────────────────────────────────────
// let _client: Awaited<ReturnType<typeof Client.create>> | null = null;

// async function getStorachaClient() {
//     if (_client) return _client;

//     const pvtKey = process.env.STORACHA_AGENT_PRIVATE_KEY;
//     const delegationKey = process.env.STORACHA_AGENT_DELEGATION;

//     if (!pvtKey || !delegationKey) {
//         throw new Error(
//             'STORACHA_AGENT_PRIVATE_KEY and STORACHA_AGENT_DELEGATION env vars required for free CSV staging'
//         );
//     }

//     const principal = Signer.parse(pvtKey);
//     const store = new StoreMemory();
//     const client = await Client.create({ principal, store });
//     const proof = await Proof.parse(delegationKey);
//     const space = await client.addSpace(proof);
//     await client.setCurrentSpace(space.did());

//     _client = client;
//     return client;
// }

// // ── Tools ─────────────────────────────────────────────────────────────────────
// export function getStorachaTools() {
//     return {

//         /**
//          * stageCsvForAnalysis — PRIMARY tool for analysis workflow.
//          *
//          * Uploads the user's CSV to Storacha for FREE (AgentA's own credentials,
//          * no x402 payment) to obtain an inputCID, which is then passed to the
//          * DataAnalyzer's paid /analyze endpoint.
//          *
//          * This mirrors the lean coordinator's Storacha upload in index.ts.
//          */
//         stageCsvForAnalysis: tool({
//             description: `Upload a CSV file to Storacha IPFS for FREE to get an inputCID.
// This is required BEFORE calling the DataAnalyzer service — the analyzer needs a CID, not raw file bytes.
// The CSV data should be passed as a base64-encoded string extracted from the user's message attachment.
// Returns inputCID to use in the subsequent x402 payment to the analyzer endpoint.
// This is FREE — AgentA uses its own Storacha credentials. No x402 payment needed for this step.`,
//             inputSchema: z.object({
//                 base64CsvData: z.string().describe("Base64-encoded CSV file content from the user's uploaded file"),
//                 filename: z.string().describe("Original filename, e.g. 'sales-data.csv'"),
//             }),
//             execute: async ({ base64CsvData, filename }: { base64CsvData: string, filename: string }): Promise<string> => {
//                 try {
//                     const client = await getStorachaClient();
//                     const buffer = Buffer.from(base64CsvData, 'base64');
//                     const file = new File([buffer], filename, { type: 'text/csv' });

//                     console.log(`[Storacha] Staging CSV: ${filename} (${buffer.length} bytes)`);
//                     const cid = await client.uploadFile(file);
//                     const cidStr = cid.toString();
//                     console.log(`[Storacha] ✅ Staged — CID: ${cidStr}`);

//                     return JSON.stringify({
//                         inputCID: cidStr,
//                         filename,
//                         sizeBytes: buffer.length,
//                         ipfsUrl: `https://w3s.link/ipfs/${cidStr}`,
//                         logLine: `✅ CSV staged — inputCID: ${cidStr.slice(0, 20)}...`,
//                     });
//                 } catch (err: any) {
//                     return `Storacha staging failed: ${err.message}`;
//                 }
//             },
//         }),

//         /**
//          * uploadToStoracha — generic upload for any file using AgentA's creds (free).
//          * Use this for intermediate data, NOT for the paid storage service.
//          */
//         uploadToStoracha: tool({
//             description: `Upload any file to Storacha IPFS for FREE using AgentA's own credentials.
// Use for intermediate data transport only. For permanent paid storage by the StorachaAgent service,
// use the fetchWithPayment tool to POST to the /upload endpoint instead.`,
//             inputSchema: z.object({
//                 base64Data: z.string().describe("Base64-encoded file content"),
//                 filename: z.string().describe("Filename with extension, e.g. 'report.txt'"),
//                 mimeType: z.string().default("application/octet-stream").describe("MIME type"),
//             }),
//             execute: async ({ base64Data, filename, mimeType }: { base64Data: string, filename: string, mimeType: string }): Promise<string> => {
//                 try {
//                     const client = await getStorachaClient();
//                     const buffer = Buffer.from(base64Data, 'base64');
//                     const file = new File([buffer], filename, { type: mimeType });

//                     const cid = await client.uploadFile(file);
//                     const cidStr = cid.toString();
//                     return JSON.stringify({
//                         cid: cidStr,
//                         filename,
//                         ipfsUrl: `https://w3s.link/ipfs/${cidStr}`,
//                     });
//                 } catch (err: any) {
//                     return `Upload failed: ${err.message}`;
//                 }
//             },
//         }),

//     };
// }


/**
 * storachaProvider.ts
 * Vercel AI SDK tools for Storacha operations in AgentA.
 *
 * TWO categories of tools:
 *
 * A) FREE — AgentA's own Storacha credentials (no x402):
 *    stageCsvForAnalysis  → stage CSV before DataAnalyzer call
 *    uploadToStoracha     → generic free upload (intermediate data)
 *
 * B) PAID — calls AgentB StorachaStorage service via x402:
 *    paidStoreFile        → FormData POST + x402 payment cycle → CID
 *    paidRetrieveFile     → GET?cid=... + x402 payment cycle → file bytes
 *
 * Why paidStoreFile/paidRetrieveFile exist:
 *   X402ActionProvider_make_http_request_with_x402 only supports string bodies.
 *   /upload requires multipart/form-data with binary content — impossible via that tool.
 *   These tools use @x402/fetch + AGENT_A_PRIVATE_KEY (EOA) to sign the EIP-712
 *   payment the same way postReputation does, then attach the binary payload directly.
 */

import { tool } from "ai";
import { z } from "zod";
import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.BASE_RPC_URL || "https://sepolia.base.org";

// ── Lazy singleton Storacha client (AgentA's free creds) ─────────────────────
let _client: Awaited<ReturnType<typeof Client.create>> | null = null;

async function getStorachaClient() {
    if (_client) return _client;

    const pvtKey = process.env.STORACHA_AGENT_PRIVATE_KEY;
    const delegationKey = process.env.STORACHA_AGENT_DELEGATION;

    if (!pvtKey || !delegationKey) {
        throw new Error(
            "STORACHA_AGENT_PRIVATE_KEY and STORACHA_AGENT_DELEGATION env vars required for free CSV staging"
        );
    }

    const principal = Signer.parse(pvtKey);
    const store = new StoreMemory();
    const client = await Client.create({ principal, store });
    const proof = await Proof.parse(delegationKey);
    const space = await client.addSpace(proof);
    await client.setCurrentSpace(space.did());

    _client = client;
    return client;
}

// ── x402 payment helper ───────────────────────────────────────────────────────
// Mirrors the lean coordinator's x402 flow:
// 1. Send initial request
// 2. If 402, parse payment requirements from X-PAYMENT-REQUIRED header / body
// 3. Sign EIP-712 with AGENT_A_PRIVATE_KEY
// 4. Retry with X-PAYMENT header
async function fetchWithX402Payment(
    url: string,
    init: RequestInit
): Promise<Response> {
    const privateKey = process.env.AGENT_A_PRIVATE_KEY as `0x${string}`;
    if (!privateKey) throw new Error("AGENT_A_PRIVATE_KEY not set — cannot sign x402 payment");

    // First attempt — no payment header
    let res = await fetch(url, init);

    if (res.status !== 402) return res; // success or non-402 error

    // Parse 402 payment requirements
    const paymentRequired = await res.json().catch(() => null);
    if (!paymentRequired) throw new Error("402 received but body was not parseable JSON");

    // Build EIP-712 payment signature using viem
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
        account,
    });

    // x402 EIP-712 domain + type (matches @x402/evm spec)
    const { domain, types, primaryType, message } = paymentRequired.paymentRequirements?.[0] ?? paymentRequired;

    const signature = await walletClient.signTypedData({
        domain,
        types,
        primaryType,
        message,
    });

    const paymentHeader = JSON.stringify({
        ...message,
        signature,
        paymentRequirements: paymentRequired.paymentRequirements ?? [paymentRequired],
    });

    // Retry with payment header — clone init but add header
    const headers = new Headers(init.headers ?? {});
    headers.set("X-PAYMENT", paymentHeader);

    res = await fetch(url, { ...init, headers });
    return res;
}

// ── Tools ─────────────────────────────────────────────────────────────────────
export function getStorachaTools() {
    return {

        // ── A) FREE TOOLS (AgentA's own Storacha creds) ──────────────────────────

        /**
         * stageCsvForAnalysis — PRIMARY tool for the analysis workflow.
         * Free upload to get an inputCID before paying the DataAnalyzer.
         */
        stageCsvForAnalysis: tool({
            description: `Upload a CSV file to Storacha IPFS for FREE to get an inputCID.
Required BEFORE calling the DataAnalyzer service — the analyzer needs a CID, not raw bytes.
Extract the base64 string from the user's [base64_data:...] attachment annotation.
Returns inputCID to pass to the subsequent x402 call to the analyzer endpoint.
FREE — AgentA's own Storacha credentials, no x402 payment.`,
            inputSchema: z.object({
                base64CsvData: z.string().describe("Base64-encoded CSV content from the user's attachment"),
                filename: z.string().describe("Original filename e.g. 'sales-data.csv'"),
            }),
            execute: async ({ base64CsvData, filename }): Promise<string> => {
                try {
                    const client = await getStorachaClient();
                    const buffer = Buffer.from(base64CsvData, "base64");
                    const file = new File([buffer], filename, { type: "text/csv" });

                    console.log(`[Storacha] Staging CSV: ${filename} (${buffer.length} bytes)`);
                    const cid = await client.uploadFile(file);
                    const cidStr = cid.toString();
                    console.log(`[Storacha] ✅ Staged — CID: ${cidStr}`);

                    return JSON.stringify({
                        inputCID: cidStr,
                        filename,
                        sizeBytes: buffer.length,
                        ipfsUrl: `https://w3s.link/ipfs/${cidStr}`,
                        logLine: `✅ CSV staged — inputCID: ${cidStr.slice(0, 20)}...`,
                    });
                } catch (err: any) {
                    return `Storacha staging failed: ${err.message}`;
                }
            },
        }),

        /**
         * uploadToStoracha — generic free upload using AgentA's creds.
         * For intermediate data only, not for the paid StorachaStorage service.
         */
        uploadToStoracha: tool({
            description: `Upload any file to Storacha IPFS for FREE using AgentA's own credentials.
For intermediate/temporary data transport only.
For permanent paid storage via AgentB's StorachaStorage, use paidStoreFile instead.`,
            inputSchema: z.object({
                base64Data: z.string().describe("Base64-encoded file content"),
                filename: z.string().describe("Filename with extension e.g. 'report.txt'"),
                mimeType: z.string().default("application/octet-stream").describe("MIME type"),
            }),
            execute: async ({ base64Data, filename, mimeType }): Promise<string> => {
                try {
                    const client = await getStorachaClient();
                    const buffer = Buffer.from(base64Data, "base64");
                    const file = new File([buffer], filename, { type: mimeType });

                    const cid = await client.uploadFile(file);
                    const cidStr = cid.toString();
                    return JSON.stringify({
                        cid: cidStr,
                        filename,
                        ipfsUrl: `https://w3s.link/ipfs/${cidStr}`,
                    });
                } catch (err: any) {
                    return `Upload failed: ${err.message}`;
                }
            },
        }),

        // ── B) PAID TOOLS (AgentB StorachaStorage via x402) ──────────────────────

        /**
         * paidStoreFile — PAID upload to AgentB StorachaStorage ($0.1 USDC).
         *
         * WHY this tool exists and NOT X402ActionProvider_make_http_request_with_x402:
         *   The x402 AgentKit tool only accepts string bodies (JSON).
         *   /upload requires multipart/form-data with actual binary file bytes.
         *   This tool decodes base64 → Uint8Array → File → FormData, then runs
         *   the full x402 payment cycle (initial request → 402 → sign EIP-712 →
         *   retry with X-PAYMENT header) using AGENT_A_PRIVATE_KEY.
         */
        paidStoreFile: tool({
            description: `Pay AgentB StorachaStorage $0.1 USDC via x402 and upload a file to IPFS.
ALWAYS call discoverService('store') first to get the endpoint and payTo address.
Use this — NOT X402ActionProvider_make_http_request_with_x402 — for file uploads
because /upload requires multipart/form-data binary content which the generic x402 tool
cannot send (it only supports string/JSON bodies).
Returns CID and IPFS URL on success.`,
            inputSchema: z.object({
                base64Data: z.string().describe("Base64-encoded file content from the user's attachment"),
                filename: z.string().describe("Original filename with extension e.g. 'report.pdf'"),
                mimeType: z.string().default("application/octet-stream").describe("MIME type of the file"),
                endpoint: z.string().describe("StorachaStorage /upload endpoint URL from discoverService"),
            }),
            execute: async ({ base64Data, filename, mimeType, endpoint }): Promise<string> => {
                try {
                    const buffer = Buffer.from(base64Data, "base64");
                    const file = new File([buffer], filename, { type: mimeType });

                    const formData = new FormData();
                    formData.append("file", file);

                    console.log(`[paidStoreFile] Uploading ${filename} (${buffer.length} bytes) → ${endpoint}`);

                    const res = await fetchWithX402Payment(endpoint, {
                        method: "POST",
                        body: formData,
                    });

                    if (!res.ok) {
                        const text = await res.text().catch(() => `HTTP ${res.status}`);
                        return `Upload failed (${res.status}): ${text}`;
                    }

                    const result = await res.json();
                    const cid = result?.data?.cid ?? result?.cid ?? "unknown";

                    console.log(`[paidStoreFile] ✅ Stored — CID: ${cid}`);

                    return JSON.stringify({
                        success: true,
                        cid,
                        filename,
                        sizeBytes: buffer.length,
                        ipfsUrl: `https://w3s.link/ipfs/${cid}`,
                        logLine: `✅ Payment confirmed, file stored by AgentB — CID: ${cid.slice(0, 20)}...`,
                    });
                } catch (err: any) {
                    return `paidStoreFile failed: ${err.message}`;
                }
            },
        }),

        /**
         * paidRetrieveFile — PAID retrieval from AgentB StorachaStorage ($0.005 USDC).
         *
         * WHY this tool exists and NOT X402ActionProvider_make_http_request_with_x402:
         *   The /retrieve endpoint returns raw binary bytes, not JSON.
         *   The generic x402 tool tries to parse the response as text/JSON and
         *   would corrupt binary data. This tool handles binary response correctly,
         *   re-encodes to base64, and provides the IPFS gateway URL as the usable link.
         */
        paidRetrieveFile: tool({
            description: `Pay AgentB StorachaStorage $0.005 USDC via x402 and retrieve a file by CID.
ALWAYS call discoverService('retrieve') first to get the endpoint.
Use this — NOT X402ActionProvider_make_http_request_with_x402 — because /retrieve
returns raw binary bytes which the generic x402 tool cannot handle correctly.
Returns the IPFS gateway URL and base64 content.`,
            inputSchema: z.object({
                cid: z.string().describe("IPFS CID of the file to retrieve"),
                endpoint: z.string().describe("StorachaStorage /retrieve endpoint URL from discoverService"),
            }),
            execute: async ({ cid, endpoint }): Promise<string> => {
                try {
                    const url = `${endpoint}?cid=${encodeURIComponent(cid)}`;
                    console.log(`[paidRetrieveFile] Retrieving CID: ${cid} from ${url}`);

                    const res = await fetchWithX402Payment(url, { method: "GET" });

                    if (!res.ok) {
                        const text = await res.text().catch(() => `HTTP ${res.status}`);
                        return `Retrieve failed (${res.status}): ${text}`;
                    }

                    const contentType = res.headers.get("content-type") || "application/octet-stream";
                    const returnedCid = res.headers.get("X-CID") || cid;

                    const arrayBuffer = await res.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString("base64");
                    const sizeKb = (arrayBuffer.byteLength / 1024).toFixed(1);

                    console.log(`[paidRetrieveFile] ✅ Retrieved ${sizeKb}KB — CID: ${returnedCid}`);

                    return JSON.stringify({
                        success: true,
                        cid: returnedCid,
                        contentType,
                        sizeBytes: arrayBuffer.byteLength,
                        base64Content: base64.slice(0, 100) + "...[truncated]",
                        ipfsUrl: `https://w3s.link/ipfs/${returnedCid}`,
                        logLine: `✅ File retrieved (${sizeKb}KB) — https://w3s.link/ipfs/${returnedCid}`,
                    });
                } catch (err: any) {
                    return `paidRetrieveFile failed: ${err.message}`;
                }
            },
        }),

    };
}