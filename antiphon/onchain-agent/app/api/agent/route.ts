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
import { setPendingFile, clearPendingFile } from "./file-context";

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
        const mimeType = file.type || "application/octet-stream";

        setPendingFile({ base64, filename: file.name, mimeType, sizeBytes: file.size });

        userMessage +=
          (userMessage ? "\n\n" : "") +
          `[File attached: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, ${mimeType})]` +
          (isCSV
            ? "\nPlease analyze this CSV file. Call stageCsvForAnalysis with the filename above."
            : "\nPlease store this file on Storacha. Call paidStoreFile with the filename above.");
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

    const historyForModel: ModelMessage[] = [...messages];

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
    //   0:"text"\n       → text chunk
    //   b:{toolName}\n   → tool call initiated
    //   a:{toolName,result}\n → tool result
    //   h:\n              → heartbeat (keeps connection alive during tool execution)
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

        const heartbeat = setInterval(() => enqueue("h:\n"), 4000);

        try {
          const t0 = Date.now();
          for await (const part of (result as any).fullStream) {
            if (controllerClosed) break;
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

            if (part.type === "text-delta") {
              const td = (part as any).textDelta ?? (part as any).delta ?? (part as any).text;
              enqueue(`0:${JSON.stringify(td)}\n`);
            } else if (part.type === "tool-input-start") {
              const name = (part as any).toolName ?? "tool";
              console.log(`[AgentA +${elapsed}s] → tool: ${name}`);
              enqueue(`b:${JSON.stringify({ toolName: name })}\n`);
            } else if (part.type === "tool-call") {
              const name = (part as any).toolName ?? "tool";
              console.log(`[AgentA +${elapsed}s] ▶ tool-call: ${name}`);
            } else if (part.type === "tool-result") {
              const output = (part as any).output ?? (part as any).result;
              const name = (part as any).toolName ?? "tool";
              const snippet = typeof output === "string"
                ? output.slice(0, 120)
                : JSON.stringify(output).slice(0, 120);
              console.log(`[AgentA +${elapsed}s] ← ${name}: ${snippet}`);
              enqueue(`a:${JSON.stringify({ toolName: name, result: output })}\n`);
            } else if (part.type === "error") {
              console.error(`[AgentA +${elapsed}s] error:`, (part as any).error);
            } else if (!["tool-input-delta", "source"].includes(part.type)) {
              console.log(`[AgentA +${elapsed}s] ${part.type}`);
            }
          }
          console.log(`[AgentA] stream done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        } catch (err) {
          console.error("[AgentA] stream error:", err);
        } finally {
          clearInterval(heartbeat);
          clearPendingFile();
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