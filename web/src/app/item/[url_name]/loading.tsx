export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-32 bg-zinc-800 rounded" />
        <div className="h-6 w-56 bg-zinc-800 rounded" />
        <div className="h-[300px] bg-zinc-800/50 rounded mt-6" />
        <div className="h-[200px] bg-zinc-800/50 rounded" />
      </div>
    </div>
  );
}
