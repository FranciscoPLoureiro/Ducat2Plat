export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-44 bg-zinc-800 rounded" />
        <div className="h-4 w-72 bg-zinc-800 rounded" />
        <div className="space-y-2 mt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-zinc-800/50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
