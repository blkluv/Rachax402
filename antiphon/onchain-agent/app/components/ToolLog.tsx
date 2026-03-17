"use client";

import { useState } from "react";

export interface ToolEvent {
  tool: string;
  status: "pending" | "done";
  result: string;
  timestamp: number;
}

export function ToolLog({ events }: { events: ToolEvent[] }) {
  const [expanded, setExpanded] = useState(true);

  if (events.length === 0) return null;

  const pending = events.filter(e => e.status === "pending").length;

  return (
    <div className="w-full max-w-2xl mt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full px-4 py-2 rounded-t-xl glass-light border border-white/10 text-left hover:bg-white/[0.04] transition"
      >
        <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
        <span className="text-[10px] sm:text-xs font-mono text-[#94a3b8] flex-1">
          agent-a-coordinator
          <span className="text-white/30 ml-2">
            {events.length} call{events.length !== 1 && "s"}
            {pending > 0 && (
              <span className="text-amber-400/70 ml-1">· {pending} running</span>
            )}
          </span>
        </span>
        <span className="text-[10px] text-white/30">{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div className="rounded-b-xl bg-[#0d1117]/90 border border-t-0 border-white/10 overflow-y-auto max-h-72 min-h-24">
          <div className="px-3 py-2 space-y-3">
            {events.map((e, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/5 bg-black/20 px-3 py-2"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {e.status === "pending" ? (
                    <span className="text-amber-400/70 shrink-0 animate-pulse text-xs">⟳</span>
                  ) : (
                    <span className="text-[#10b981]/70 shrink-0 text-xs">✓</span>
                  )}
                  <span className="text-[11px] font-mono font-medium text-[#8b5cf6] shrink-0">
                    {e.tool}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#00d4aa]/90 break-all whitespace-pre-wrap leading-relaxed">
                  {e.status === "pending" ? "…" : e.result || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
