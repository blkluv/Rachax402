/**
 * storachaProvider.ts
 * Vercel AI SDK tools for Storacha operations in AgentA.
 *
 * A) FREE — AgentA's own Storacha credentials (no x402)
 * B) PAID — AgentB StorachaStorage via x402, using CDP Smart Wallet (not EOA)
 *
 * paidStoreFile/paidRetrieveFile use @x402/fetch wrapFetchWithPayment with the
 * wallet provider's signer — same flow as X402ActionProvider. The generic HTTP
 * tool cannot send multipart/form-data or handle binary responses.
 */

import { tool } from "ai";
import { z } from "zod";
import * as Client from "@storacha/client";
import { StoreMemory } from "@storacha/client/stores/memory";
import * as Proof from "@storacha/client/proof";
import { Signer } from "@storacha/client/principal/ed25519";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { toClientEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { WalletProvider } from "@coinbase/agentkit";
import { EvmWalletProvider } from "@coinbase/agentkit";
import { getPendingFile } from "../file-context";
 
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
 
const X402_RETRY_DELAY_MS = 1500;
 
function createX402Fetch(walletProvider: WalletProvider) {
    if (!(walletProvider instanceof EvmWalletProvider)) {
        throw new Error("paidStoreFile/paidRetrieveFile require EvmWalletProvider (CDP Smart Wallet)");
    }
 
    // CdpSmartWalletProvider.toSigner() returns the OWNER's viem Account (EOA).
    // The smart wallet is the actual USDC holder (0xf2e2..., 11 USDC).
    // We must set signer.address = smart wallet address so that Permit2 uses the
    // smart wallet as the token owner. The owner EOA signs the EIP-712 payload;
    // EIP-1271 on the smart wallet contract verifies it on-chain.
    // Without this: Permit2 owner = owner EOA (0x2E84..., 7 USDC) — wrong balance used.
    const signer = walletProvider.toSigner();
    const publicClient = walletProvider.getPublicClient();
    const smartWalletAddress = walletProvider.getAddress() as `0x${string}`;
    const signerForSmartWallet = { ...signer, address: smartWalletAddress };
 
    const clientEvmSigner = toClientEvmSigner(
        signerForSmartWallet as typeof signer,
        publicClient,
    );
    const client = new x402Client();
    registerExactEvmScheme(client, { signer: clientEvmSigner });
    return wrapFetchWithPayment(fetch, client);
}
 
async function fetchWithPaymentRetry(
    fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>,
    url: string,
    init: RequestInit,
    retryInit?: () => RequestInit
): Promise<Response> {
    const res = await fetchWithPayment(url, init);
    if (res.status === 402) {
        await new Promise((r) => setTimeout(r, X402_RETRY_DELAY_MS));
        return fetchWithPayment(url, retryInit ? retryInit() : init);
    }
    return res;
}


export function getStorachaTools(walletProvider: WalletProvider) {
    return {
 
        // ── A) FREE TOOLS (AgentA's own Storacha creds) ──────────────────────────
 
        /**
         * stageCsvForAnalysis — PRIMARY tool for the analysis workflow.
         * Free upload to get an inputCID before paying the DataAnalyzer.
         */
        stageCsvForAnalysis: tool({
            description: `Upload the user's attached CSV file to Storacha IPFS for FREE to get an inputCID.
Required BEFORE calling the DataAnalyzer — the analyzer needs a CID, not raw bytes.
The file bytes are pre-loaded server-side; just pass the filename from the [File attached: "..."] annotation.
FREE — uses AgentA's own Storacha credentials, no x402 payment.`,
            inputSchema: z.object({
                filename: z.string().describe("Filename from the [File attached: \"...\"] annotation"),
            }),
            execute: async ({ filename }): Promise<string> => {
                try {
                    const pending = getPendingFile();
                    if (!pending) {
                        return "No file attached. Ask the user to upload a CSV file.";
                    }
 
                    const client = await getStorachaClient();
                    const buffer = Buffer.from(pending.base64, "base64");
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
            description: `Upload the user's attached file to Storacha IPFS for FREE using AgentA's own credentials.
For intermediate/temporary data transport only.
For permanent paid storage via AgentB's StorachaStorage, use paidStoreFile instead.
The file bytes are pre-loaded server-side; just pass the filename.`,
            inputSchema: z.object({
                filename: z.string().describe("Filename from the [File attached: \"...\"] annotation"),
            }),
            execute: async ({ filename }): Promise<string> => {
                try {
                    const pending = getPendingFile();
                    if (!pending) {
                        return "No file attached. Ask the user to upload a file.";
                    }
                    const client = await getStorachaClient();
                    const buffer = Buffer.from(pending.base64, "base64");
                    const file = new File([buffer], filename, { type: pending.mimeType });
 
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
The file bytes are pre-loaded server-side; just pass the filename from the [File attached: "..."] annotation.
Returns CID and IPFS URL on success.`,
            inputSchema: z.object({
                filename: z.string().describe("Filename from the [File attached: \"...\"] annotation"),
                endpoint: z.string().describe("StorachaStorage /upload endpoint URL from discoverService"),
            }),
            execute: async ({ filename, endpoint }): Promise<string> => {
                try {
                    const pending = getPendingFile();
                    if (!pending) {
                        return "No file attached. Ask the user to upload a file.";
                    }
                    const buffer = Buffer.from(pending.base64, "base64");
                    const file = new File([buffer], filename, { type: pending.mimeType });
 
                    const formData = new FormData();
                    formData.append("file", file);
 
                    console.log(`[paidStoreFile] Uploading ${filename} (${buffer.length} bytes) → ${endpoint}`);
 
                    const fetchWithPayment = createX402Fetch(walletProvider);
                    const res = await fetchWithPaymentRetry(
                        fetchWithPayment,
                        endpoint,
                        { method: "POST", body: formData },
                        () => {
                            const retryForm = new FormData();
                            retryForm.append("file", new File([buffer], filename, { type: pending.mimeType }));
                            return { method: "POST", body: retryForm };
                        }
                    );
 
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
 
                    const fetchWithPayment = createX402Fetch(walletProvider);
                    const res = await fetchWithPaymentRetry(fetchWithPayment, url, { method: "GET" });
 
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