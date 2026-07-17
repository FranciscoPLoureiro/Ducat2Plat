"use client";

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="border border-red-800 bg-red-900/20 rounded p-6 text-center">
        <h2 className="text-lg font-semibold text-red-400 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-zinc-400 mb-4">
          {error.message || "An unexpected error occurred."}
        </p>
        <button
          onClick={unstable_retry}
          className="px-4 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
