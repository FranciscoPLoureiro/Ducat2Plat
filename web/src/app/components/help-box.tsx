// Server-renderable collapsible help — native <details>, no JS needed.
export default function HelpBox({ children }: { children: React.ReactNode }) {
  return (
    <details className="mb-4 text-sm text-zinc-400 border border-zinc-800 rounded">
      <summary className="px-3 py-2 cursor-pointer select-none text-zinc-500 hover:text-zinc-300 transition-colors">
        How to read this
      </summary>
      <div className="px-3 pb-3 space-y-1.5 leading-relaxed">{children}</div>
    </details>
  );
}
