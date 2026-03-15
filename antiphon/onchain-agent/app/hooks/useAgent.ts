// /**
//  * useAgent.ts — Rachax402 AgentKit React Hook
//  *
//  * Consumes the AI SDK v5 data stream from /api/agent (streamText).
//  * Updates the agent message and tool-call panel in real time as each
//  * event arrives, so long pipelines (2-3 min) don't appear frozen.
//  */

// import { useState } from "react";

// export interface AgentMessage {
//   text: string;
//   sender: "user" | "agent";
//   toolCalls?: Array<{ tool: string; result: string }>;
//   timestamp: number;
// }

// export interface SendMessageOptions {
//   file?: File;
// }

// /**
//  * Async generator that yields parsed events from an AI SDK v5 data stream.
//  * Format per line: `{typeCode}:{json}\n`
//  *   0 = text delta (string)
//  *   a = tool result { toolName, result }
//  */
// async function* readDataStream(body: ReadableStream<Uint8Array>) {
//   const reader = body.getReader();
//   const decoder = new TextDecoder();
//   let buffer = "";

//   try {
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;

//       buffer += decoder.decode(value, { stream: true });
//       const lines = buffer.split("\n");
//       buffer = lines.pop() ?? "";

//       for (const line of lines) {
//         if (!line.trim()) continue;
//         const colon = line.indexOf(":");
//         if (colon === -1) continue;
//         const type = line.slice(0, colon);
//         const data = line.slice(colon + 1);
//         try {
//           if (type === "0") {
//             yield { type: "text" as const, delta: JSON.parse(data) as string };
//           } else if (type === "a") {
//             const parsed = JSON.parse(data) as { toolName?: string; result?: unknown };
//             if (parsed.toolName) {
//               yield {
//                 type: "toolResult" as const,
//                 toolName: parsed.toolName,
//                 result: (
//                   typeof parsed.result === "string"
//                     ? parsed.result
//                     : JSON.stringify(parsed.result)
//                 ).slice(0, 120),
//               };
//             }
//           }
//         } catch {
//           // malformed chunk — skip
//         }
//       }
//     }
//   } finally {
//     reader.releaseLock();
//   }
// }

// export function useAgent() {
//   const [messages, setMessages] = useState<AgentMessage[]>([]);
//   const [isThinking, setIsThinking] = useState(false);

//   const sendMessage = async (input: string, options?: SendMessageOptions) => {
//     if (!input.trim() && !options?.file) return;

//     const displayText = options?.file
//       ? `${input || "Process this file:"} [${options.file.name}]`
//       : input;

//     setMessages(prev => [...prev, { text: displayText, sender: "user", timestamp: Date.now() }]);
//     setIsThinking(true);

//     // Add agent placeholder immediately — updated progressively below
//     const agentTs = Date.now();
//     setMessages(prev => [...prev, { text: "", sender: "agent", timestamp: agentTs }]);

//     let agentText = "";
//     let agentToolCalls: AgentMessage["toolCalls"] = [];

//     const updateLast = (text: string, toolCalls: AgentMessage["toolCalls"]) =>
//       setMessages(prev => {
//         const next = [...prev];
//         next[next.length - 1] = { text, sender: "agent", toolCalls, timestamp: agentTs };
//         return next;
//       });

//     try {
//       let body: BodyInit;
//       const headers: HeadersInit = {};

//       if (options?.file) {
//         const formData = new FormData();
//         formData.append("message", input);
//         formData.append("file", options.file);
//         body = formData;
//       } else {
//         body = JSON.stringify({ userMessage: input });
//         headers["Content-Type"] = "application/json";
//       }

//       const res = await fetch("/api/agent", { method: "POST", headers, body });

//       if (!res.ok) {
//         const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
//         updateLast(err.error ?? "AgentA returned an error.", undefined);
//         return;
//       }

//       if (!res.body) {
//         updateLast("No response body from AgentA.", undefined);
//         return;
//       }

//       for await (const event of readDataStream(res.body)) {
//         if (event.type === "text") {
//           agentText += event.delta;
//           updateLast(agentText, agentToolCalls);
//         } else if (event.type === "toolResult") {
//           agentToolCalls = [...(agentToolCalls ?? []), { tool: event.toolName, result: event.result }];
//           updateLast(agentText, agentToolCalls);
//         }
//       }

//       updateLast(agentText || "No response.", agentToolCalls?.length ? agentToolCalls : undefined);
//     } catch (err) {
//       console.error("[useAgent] stream error:", err);
//       updateLast("Could not reach AgentA. Is the Next.js server running?", undefined);
//     } finally {
//       setIsThinking(false);
//     }
//   };

//   const clearHistory = () => setMessages([]);

//   return { messages, sendMessage, isThinking, clearHistory };
// }


/**
 * useAgent.ts — Rachax402 AgentKit React Hook
 *
 * Reads the text/plain stream from route.ts and reassembles:
 *   0:"<delta>"\n  → text chunks accumulated into the agent message
 *   a:{...}\n      → tool result appended to the live toolCalls log
 *
 * This matches the stream format written by route.ts fullStream.
 */

import { useState, useRef } from "react";

export interface AgentMessage {
  text: string;
  sender: "user" | "agent";
  toolCalls?: Array<{ tool: string; result: string }>;
  timestamp: number;
}

export interface SendMessageOptions {
  file?: File;
}

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  // Track the index of the in-progress agent message so we can patch it live
  const streamingIndexRef = useRef<number | null>(null);

  const sendMessage = async (input: string, options?: SendMessageOptions) => {
    if (!input.trim() && !options?.file) return;

    const displayText = options?.file
      ? `${input || "Process this file:"} [${options.file.name}]`
      : input;

    // Add user message
    setMessages(prev => [
      ...prev,
      { text: displayText, sender: "user", timestamp: Date.now() },
    ]);
    setIsThinking(true);

    // Placeholder for the in-progress agent message
    const agentMsgIndex = await new Promise<number>(resolve => {
      setMessages(prev => {
        const idx = prev.length;
        streamingIndexRef.current = idx;
        resolve(idx);
        return [
          ...prev,
          { text: "", sender: "agent", toolCalls: [], timestamp: Date.now() },
        ];
      });
    });

    try {
      let body: BodyInit;
      const headers: HeadersInit = {};

      if (options?.file) {
        const formData = new FormData();
        formData.append("message", input);
        formData.append("file", options.file);
        body = formData;
      } else {
        body = JSON.stringify({ userMessage: input });
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch("/api/agent", { method: "POST", headers, body });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        setMessages(prev =>
          prev.map((m, i) =>
            i === agentMsgIndex ? { ...m, text: `Error: ${errText}` } : m
          )
        );
        return;
      }

      // ── Parse the text/plain stream ──────────────────────────────────
      // route.ts writes two event types per line:
      //   0:"<text delta>"\n   — partial text token
      //   a:{toolName,result}\n — tool execution result
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";
      const accTools: Array<{ tool: string; result: string }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith("0:")) {
            try {
              const delta: string = JSON.parse(line.slice(2));
              accText += delta;
              setMessages(prev =>
                prev.map((m, i) =>
                  i === agentMsgIndex ? { ...m, text: accText } : m
                )
              );
            } catch { /* ignore malformed line */ }

          } else if (line.startsWith("b:")) {
            // Tool call initiated: b:{"toolName":"discoverService"}
            try {
              const payload = JSON.parse(line.slice(2));
              const pending = { tool: payload.toolName ?? "tool", result: "…" };
              accTools.push(pending);
              setMessages(prev =>
                prev.map((m, i) =>
                  i === agentMsgIndex ? { ...m, toolCalls: [...accTools] } : m
                )
              );
            } catch { /* ignore */ }

          } else if (line.startsWith("a:")) {
            // Tool result: a:{"toolName":"discoverService","result":"..."}
            try {
              const payload = JSON.parse(line.slice(2));
              const resultText = (
                typeof payload.result === "string"
                  ? payload.result
                  : JSON.stringify(payload.result)
              ).slice(0, 200);
              // Update the matching pending entry (last one with this tool name + "…")
              const pendingIdx = [...accTools].reverse()
                .findIndex(t => t.tool === (payload.toolName ?? "tool") && t.result === "…");
              if (pendingIdx !== -1) {
                accTools[accTools.length - 1 - pendingIdx] = {
                  tool: payload.toolName ?? "tool",
                  result: resultText,
                };
              } else {
                accTools.push({ tool: payload.toolName ?? "tool", result: resultText });
              }
              setMessages(prev =>
                prev.map((m, i) =>
                  i === agentMsgIndex ? { ...m, toolCalls: [...accTools] } : m
                )
              );
            } catch { /* ignore */ }
          }
        }
      }

      // Finalise: if stream ended with no text, show a fallback
      setMessages(prev =>
        prev.map((m, i) =>
          i === agentMsgIndex
            ? {
              ...m,
              text: accText.trim() || "No response.",
              toolCalls: accTools.length > 0 ? accTools : undefined,
            }
            : m
        )
      );

    } catch (err) {
      console.error("[useAgent] fetch error:", err);
      setMessages(prev =>
        prev.map((m, i) =>
          i === agentMsgIndex
            ? { ...m, text: "Could not reach AgentA. Is the server running?" }
            : m
        )
      );
    } finally {
      setIsThinking(false);
      streamingIndexRef.current = null;
    }
  };

  const clearHistory = () => setMessages([]);

  return { messages, sendMessage, isThinking, clearHistory };
}