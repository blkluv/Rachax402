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
import type { ToolEvent } from "../components/ToolLog";

export interface AgentMessage {
  text: string;
  sender: "user" | "agent";
  timestamp: number;
}

export interface SendMessageOptions {
  file?: File;
}

export function useAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [isThinking, setIsThinking] = useState(false);
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

    const agentMsgIndex = await new Promise<number>(resolve => {
      setMessages(prev => {
        const idx = prev.length;
        streamingIndexRef.current = idx;
        resolve(idx);
        return [
          ...prev,
          { text: "", sender: "agent", timestamp: Date.now() },
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

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
            } catch { /* ignore */ }

          } else if (line.startsWith("b:")) {
            try {
              const payload = JSON.parse(line.slice(2));
              const name = payload.toolName ?? "tool";
              setToolEvents(prev => [
                ...prev,
                { tool: name, status: "pending", result: "", timestamp: Date.now() },
              ]);
            } catch { /* ignore */ }

          } else if (line.startsWith("a:")) {
            try {
              const payload = JSON.parse(line.slice(2));
              const name = payload.toolName ?? "tool";
              const resultText =
                typeof payload.result === "string"
                  ? payload.result
                  : JSON.stringify(payload.result);
              setToolEvents(prev => {
                const updated = [...prev];
                const idx = [...updated].reverse()
                  .findIndex(e => e.tool === name && e.status === "pending");
                if (idx !== -1) {
                  updated[updated.length - 1 - idx] = {
                    ...updated[updated.length - 1 - idx],
                    status: "done",
                    result: resultText,
                  };
                } else {
                  updated.push({ tool: name, status: "done", result: resultText, timestamp: Date.now() });
                }
                return updated;
              });
            } catch { /* ignore */ }
          }
        }
      }

      setMessages(prev =>
        prev.map((m, i) =>
          i === agentMsgIndex
            ? { ...m, text: accText.trim() || "No response." }
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

  const clearHistory = () => {
    setMessages([]);
    setToolEvents([]);
  };

  return { messages, toolEvents, sendMessage, isThinking, clearHistory };
}