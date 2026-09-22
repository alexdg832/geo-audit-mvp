import { SourceTier } from "@/lib/audit/types";

type Mention = {
  id: string;
  name: string;
  url: string | null;
  tier: number;
  snippet: string;
  accurate: boolean;
};

const TIER_META: Record<SourceTier, { label: string; description: string; badgeClass: string }> = {
  1: {
    label: "Tier 1 — Trusted",
    description: "Official, authoritative sources. Full credit.",
    badgeClass: "bg-green-100 text-green-800",
  },
  2: {
    label: "Tier 2 — Mixed",
    description: "Directories, blogs, and press releases. Partial credit.",
    badgeClass: "bg-amber-100 text-amber-800",
  },
  3: {
    label: "Tier 3 — Low-trust",
    description: "Forums, anonymous reviews, and social comments. Counts against your score.",
    badgeClass: "bg-red-100 text-red-800",
  },
};

export function SourceTierList({ mentions }: { mentions: Mention[] }) {
  const tiers: SourceTier[] = [1, 2, 3];

  return (
    <div className="space-y-6">
      {tiers.map((tier) => {
        const items = mentions.filter((m) => m.tier === tier);
        if (items.length === 0) return null;
        const meta = TIER_META[tier];

        return (
          <div key={tier}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}>
                {meta.label}
              </span>
              <span className="text-xs text-stone-500">{meta.description}</span>
            </div>
            <ul className="space-y-2">
              {items.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-stone-900">{m.name}</p>
                    <p className="text-stone-600">{m.snippet}</p>
                  </div>
                  {!m.accurate && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Flagged
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
