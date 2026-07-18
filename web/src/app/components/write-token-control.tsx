"use client";

import { useState } from "react";
import { useWriteToken, setWriteToken } from "@/lib/write-token";

export default function WriteTokenControl() {
  const token = useWriteToken();
  const [input, setInput] = useState("");

  if (token) {
    return (
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="text-emerald-500">✓ Write access enabled on this device</span>
        <button
          onClick={() => setWriteToken(null)}
          className="px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Forget token
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <span>Read-only — enter the write token to record/close positions:</span>
      <input
        type="password"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="write token"
        className="px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 w-44 focus:outline-none focus:border-zinc-500"
      />
      <button
        onClick={() => {
          if (input.trim()) {
            setWriteToken(input.trim());
            setInput("");
          }
        }}
        className="px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        Unlock
      </button>
    </div>
  );
}
