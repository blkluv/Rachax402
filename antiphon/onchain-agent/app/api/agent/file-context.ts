/**
 * Server-side file context store.
 *
 * Holds the latest file upload extracted in route.ts so that tools
 * (stageCsvForAnalysis, paidStoreFile) can read the raw bytes directly
 * instead of receiving base64 as a tool parameter from the LLM.
 *
 * Without this, Claude has to re-generate the entire base64 string
 * token-by-token (~6000 tokens for a 13KB file) which takes minutes
 * and starves the HTTP stream of data, causing browser timeouts.
 */

interface PendingFile {
  base64: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

let _pending: PendingFile | null = null;

export function setPendingFile(f: PendingFile) { _pending = f; }
export function getPendingFile(): PendingFile | null { return _pending; }
export function clearPendingFile() { _pending = null; }
