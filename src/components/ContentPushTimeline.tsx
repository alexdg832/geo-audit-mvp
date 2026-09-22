type Push = {
  id: string;
  title: string;
  type: string;
  targetChannel: string | null;
  status: string;
};

const STATUS_COLORS: Record<string, string> = {
  Planned: "bg-stone-200 text-stone-700",
  "In Progress": "bg-amber-100 text-amber-800",
  Published: "bg-green-100 text-green-800",
};

export function ContentPushTimeline({ pushes }: { pushes: Push[] }) {
  if (pushes.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No content pushes yet — your account manager will add these as work begins.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {pushes.map((p) => (
        <li
          key={p.id}
          className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3"
        >
          <div>
            <p className="font-medium text-stone-900">{p.title}</p>
            <p className="text-sm text-stone-500">
              {p.type}
              {p.targetChannel ? ` · ${p.targetChannel}` : ""}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              STATUS_COLORS[p.status] ?? "bg-stone-200 text-stone-700"
            }`}
          >
            {p.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
