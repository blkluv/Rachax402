/**
 * route.ts — Rachax402 AgentKit API Route
 *
 * Uses streamText so tool execution events keep the HTTP connection alive,
 * preventing browser/Vercel timeouts during 2-3 min agent pipelines.
 *
 * BUG FIXED (AI_InvalidPromptError: messages must not be empty):
 *   historyWithoutBlobs was built from `messages` BEFORE the new user message
 *   was pushed. On the first turn messages=[] → streamText received zero
 *   messages → crash. Fix: push first, then snapshot with blob-stripping.
 */

import { NextResponse } from "next/server";
import { createAgent } from "./create-agent";
import { ModelMessage, streamText, stepCountIs } from "ai";

// Next.js max route duration (seconds) — required for Vercel / long pipelines
export const maxDuration = 300;

// In-memory conversation history (resets on server restart)
const messages: ModelMessage[] = [];

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let userMessage = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const textInput = (formData.get("message") as string) || "";
      const file = formData.get("file") as File | null;

      userMessage = textInput;

      if (file && file.size > 0) {
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        const isCSV = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";

        userMessage +=
          (userMessage ? "\n\n" : "") +
          `[File attached: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${file.type || "application/octet-stream"})]\n` +
          `[base64_data:${base64}]\n\n` +
          (isCSV ? "Please analyze this CSV file." : "Please store this file on Storacha.");
      }
    } else {
      const body = await req.json();
      userMessage = body.userMessage || body.message || "";
    }

    if (!userMessage.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const agent = await createAgent();

    messages.push({ role: "user", content: userMessage });

    // Strip base64 blobs from history ONLY — never from the current message.
    // The current message's base64 must remain intact so Claude can extract it
    // and pass it verbatim to stageCsvForAnalysis / paidStoreFile.
    // Stripping the current message caused Claude to hallucinate a short base64,
    // which decoded to ~6 garbage bytes instead of the real file content.
    const currentIdx = messages.length - 1;
    const historyForModel: ModelMessage[] = messages.map((m, idx) => {
      if (idx === currentIdx) return m;
      if (m.role !== "user" || typeof m.content !== "string") return m;
      return { ...m, content: m.content.replace(/\[base64_data:[^\]]{200,}\]/g, "[base64_data:stripped]") };
    });

    const result = streamText({
      model: agent.model,
      system: agent.system,
      tools: agent.tools as any,
      messages: historyForModel,
      stopWhen: stepCountIs(agent.maxSteps),
      onFinish: ({ response }) => {
        if (response?.messages?.length) {
          for (const msg of response.messages) {
            messages.push(msg as ModelMessage);
          }
        }
      },
    });

    // Stream format:
    //   0:"<text delta>"\n   → text chunk (parsed by useAgent.ts)
    //   a:{toolName,result}\n → tool result (shown in live log panel)
    const encoder = new TextEncoder();
    let controllerClosed = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enqueue = (data: string) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            controllerClosed = true;
          }
        };

        try {
          for await (const part of (result as any).fullStream) {
            if (controllerClosed) break;
            if (part.type === "text-delta") {
              const td = (part as any).textDelta ?? (part as any).delta ?? (part as any).text;
              enqueue(`0:${JSON.stringify(td)}\n`);
            } else if (part.type === "tool-call") {
              console.log(`[AgentA] → tool: ${part.toolName}`);
              enqueue(`b:${JSON.stringify({ toolName: part.toolName })}\n`);
            } else if (part.type === "tool-result") {
              const output = (part as any).output ?? (part as any).result;
              const resultSnippet = typeof output === "string"
                ? output.slice(0, 120)
                : JSON.stringify(output).slice(0, 120);
              console.log(`[AgentA] ← ${part.toolName}: ${resultSnippet}`);
              enqueue(`a:${JSON.stringify({ toolName: part.toolName, result: output })}\n`);
            } else if (part.type === "error") {
              console.error(`[AgentA] stream part error:`, part.error);
            }
          }
        } catch (err) {
          console.error("[AgentA] stream error:", err);
        } finally {
          if (!controllerClosed) {
            controllerClosed = true;
            controller.close();
          }
        }
      },
      cancel() {
        controllerClosed = true;
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error) {
    console.error("[AgentA] Route error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "AgentA encountered an error. Check Anthropic API key and CDP credentials.",
      },
      { status: 500 },
    );
  }
}