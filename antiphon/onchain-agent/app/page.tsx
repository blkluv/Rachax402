"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "./hooks/useAgent";
import { ToolLog } from "./components/ToolLog";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { messages, toolEvents, sendMessage, isThinking, clearHistory } = useAgent();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || isThinking) return;
    const msg = input;
    const file = selectedFile;
    setInput("");
    setSelectedFile(null);
    await sendMessage(msg || "Please process this file.", file ? { file } : undefined);
  };

  const handleFileSelect = (file: File) => setSelectedFile(file);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  }, []);

  const isCSV = selectedFile?.name.toLowerCase().endsWith(".csv");

  return (
    <div className="flex flex-col flex-grow items-center justify-center w-full h-full">
      <div className="w-full max-w-2xl h-[80vh] max-h-[720px] glass rounded-2xl overflow-hidden flex flex-col shadow-glow-erc border border-white/[0.06] card-3d">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 glass-light">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse shadow-glow-x402" />
            <span className="text-[10px] sm:text-xs font-mono text-[#94a3b8] tracking-wide">
              AgentA · ERC-8004 · x402 · Storacha · Base
            </span>
          </div>
          <button
            onClick={clearHistory}
            className="text-xs text-[#64748b] hover:text-[#e2e8f0] transition px-2.5 py-1.5 rounded-lg hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        <div className="flex-grow overflow-y-auto space-y-3 p-4 min-h-0">
          {messages.length === 0 && !isThinking && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-6 py-8">
              <div className="w-14 h-14 rounded-2xl gradient-rachax flex items-center justify-center text-2xl shadow-glow-erc">
                🤖
              </div>
              <div>
                <p className="font-semibold text-lg text-[#e2e8f0] mb-1">
                  AgentA is ready
                </p>
                <p className="text-sm text-[#94a3b8] max-w-xs">
                  Upload a CSV to analyze, store on Storacha, or enter a
                  CID to retrieve. AgentA discovers services on-chain and pays
                  autonomously via x402.
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {[
                  { label: "Analyze CSV", hint: "$0.01 USDC", color: "x402" },
                  { label: "Store File", hint: "$0.1 USDC", color: "storacha" },
                  { label: "Retrieve by CID", hint: "$0.005 USDC", color: "erc" },
                ].map((s) => (
                  <button
                    key={s.label}
                    className="px-3 py-2 rounded-xl glass-light border border-white/10 text-xs hover:border-white/20 transition card-3d"
                    onClick={() => {
                      if (s.label.includes("Retrieve"))
                        setInput("Retrieve CID: bafkrei...");
                      else fileInputRef.current?.click();
                    }}
                  >
                    <span className="text-[#e2e8f0]">{s.label}</span>
                    <span
                      className={
                        s.color === "x402"
                          ? "text-[#10b981] ml-1"
                          : s.color === "storacha"
                            ? "text-[#00d4aa] ml-1"
                            : "text-[#8b5cf6] ml-1"
                      }
                    >
                      {s.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.sender === "user"
                    ? "gradient-rachax text-white rounded-tr-sm shadow-glow-erc"
                    : "glass-light border border-white/10 rounded-tl-sm"
                }`}
              >
                {msg.sender === "agent" ? (
                  <div className="prose prose-sm prose-invert max-w-none prose-p:text-[#e2e8f0] prose-li:text-[#cbd5e1]">
                    <ReactMarkdown
                      components={{
                        a: (props) => (
                          <a
                            {...props}
                            className="text-[#00d4aa] underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          />
                        ),
                        code: (props) => (
                          <code className="bg-white/10 rounded px-1.5 py-0.5 text-xs font-mono text-[#a78bfa]">
                            {props.children}
                          </code>
                        ),
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.text}</p>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="glass-light rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 border border-white/10">
                <span className="text-base">🤖</span>
                <span className="text-sm italic text-[#94a3b8]">
                  AgentA reasoning on-chain...
                </span>
                <div className="flex gap-0.5 ml-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-white/5 p-3 space-y-2 glass-light">
          {!selectedFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-3 rounded-xl border border-dashed text-xs text-center cursor-pointer transition card-3d ${
                isDragging
                  ? "border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa]"
                  : "border-white/15 text-[#64748b] hover:border-white/25 hover:text-[#94a3b8]"
              }`}
            >
              📎 Drop file or click — CSV (analyze) · any file (store) · or type
              CID to retrieve
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl glass border border-white/10">
              <span>{isCSV ? "📊" : "📎"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-[#e2e8f0] truncate">
                  {selectedFile.name}
                </div>
                <div className="text-[10px] text-[#64748b]">
                  {(selectedFile.size / 1024).toFixed(1)} KB ·
                  {isCSV
                    ? " DataAnalyzer"
                    : " StorachaAgent"}
                </div>
              </div>
              <button
                onClick={() => setSelectedFile(null)}
                className="text-[#64748b] hover:text-[#e2e8f0] text-xs px-1.5 py-1 rounded hover:bg-white/5"
              >
                ✕
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = "";
            }}
          />

          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-grow p-3 rounded-xl glass border border-white/10 text-sm placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]/50 focus:border-[#8b5cf6]/50 disabled:opacity-50 transition bg-white/[0.02]"
              placeholder={
                selectedFile
                  ? "Add a message or press Enter…"
                  : "Ask AgentA to analyze, store, or retrieve…"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSend()
              }
              disabled={isThinking}
            />
            <button
              onClick={handleSend}
              disabled={isThinking || (!input.trim() && !selectedFile)}
              className="px-5 py-3 rounded-xl font-semibold text-sm transition-all gradient-rachax text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-erc hover:opacity-95 card-3d"
            >
              {isThinking ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
      <ToolLog events={toolEvents} />
    </div>
  );
}
