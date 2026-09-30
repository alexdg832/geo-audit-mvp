export type ThreadMessage = {
  id: string;
  author: string;
  authorName: string | null;
  body: string;
  emailStatus: string | null;
  createdAt: Date;
};

export function formatWhen(d: Date): string {
  return d.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC";
}

export function MessageList({ messages, viewer }: { messages: ThreadMessage[]; viewer: "client" | "admin" }) {
  if (messages.length === 0) return <p className="text-sm text-stone-500">No messages yet.</p>;
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const fromTeam = m.author === "admin";
        const who = fromTeam ? "TrueSource" : viewer === "client" ? "You" : (m.authorName ?? "Client");
        return (
          <li key={m.id} className={`rounded-xl border p-4 ${fromTeam ? "border-stone-200 bg-stone-50" : "border-stone-300 bg-white"}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
              <span className="font-semibold text-stone-700">{who}</span>
              <span>
                {formatWhen(m.createdAt)}
                {viewer === "admin" && m.emailStatus && <> · email {m.emailStatus}</>}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{m.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
