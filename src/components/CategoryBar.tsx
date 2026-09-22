export function CategoryBar({
  label,
  score,
  max,
  tooltip,
}: {
  label: string;
  score: number;
  max: number;
  tooltip?: string;
}) {
  const pct = Math.max(0, Math.min(100, (score / max) * 100));
  return (
    <div title={tooltip}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-stone-800">{label}</span>
        <span className="text-stone-500">
          {score}/{max}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
