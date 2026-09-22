import { AiSnippetPart } from "@/lib/audit/types";

export function AiSnippetBlock({ parts }: { parts: AiSnippetPart[] }) {
  return (
    <div className="rounded-xl bg-stone-100 p-5 text-stone-800 leading-relaxed">
      {parts.map((part, i) =>
        part.accurate ? (
          <span key={i}>{part.text}</span>
        ) : (
          <mark key={i} className="rounded bg-amber-200 px-1 py-0.5 text-stone-900">
            {part.text}
          </mark>
        )
      )}
      <p className="mt-3 text-xs text-stone-500">
        Highlighted text flags claims that appear inaccurate or outdated.
      </p>
    </div>
  );
}
