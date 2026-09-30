import { Badge, tierTone } from "@/components/ui/Badge";
import type { ReportData } from "@/lib/report/load";
import { safeHref } from "@/lib/report/load";
import { TIER_META } from "@/lib/scan/sources";
import { Section } from "./Section";

export function SourceMap({ data }: { data: ReportData }) {
  const mentionedRuns = data.runs.filter((r) => r.status === "complete" && r.mentioned);
  const allCitations = data.runs.flatMap((r) => r.citations.map((c) => ({ ...c, mentioned: Boolean(r.mentioned), engine: r.engineLabel })));
  const aboutYou = allCitations.filter((c) => c.mentioned);
  const tier4Share = aboutYou.length ? aboutYou.filter((c) => c.tier === 4).length / aboutYou.length : 0;
  const noSource = mentionedRuns.filter((r) => r.noCitations).length;

  const byTier = ([1, 2, 3, 4] as const).map((tier) => {
    const domains = new Map<string, { count: number; aboutYou: number; engines: Set<string>; sample: string; title: string | null }>();
    for (const c of allCitations.filter((x) => x.tier === tier)) {
      const d = domains.get(c.domain) ?? { count: 0, aboutYou: 0, engines: new Set(), sample: c.url, title: c.title };
      d.count += 1;
      if (c.mentioned) d.aboutYou += 1;
      d.engines.add(c.engine);
      domains.set(c.domain, d);
    }
    return { tier, domains: Array.from(domains.entries()).sort((a, b) => b[1].aboutYou - a[1].aboutYou || b[1].count - a[1].count) };
  });

  return (
    <Section id="sources" title="Where AI gets its information about you" intro={`${allCitations.length} sources were cited across all answers; ${aboutYou.length} of them sit behind answers that mention you.`}>
      {tier4Share >= 0.4 && aboutYou.length > 0 && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <strong>Warning:</strong> {Math.round(tier4Share * 100)}% of the sources behind answers about you are Tier 4 — forums, social posts or anonymous pages. Low-trust sources are defining your reputation.
        </p>
      )}
      {noSource > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {noSource} answer{noSource === 1 ? "" : "s"} about you came with no source at all. Nothing verifiable anchors what those engines said.
        </p>
      )}
      <div className="space-y-5">
        {byTier.map(({ tier, domains }) => (
          <div key={tier}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={tierTone(tier)}>{TIER_META[tier].label}</Badge>
              <span className="text-xs text-stone-500">{TIER_META[tier].description}</span>
              <span className="ml-auto text-xs text-stone-500">{domains.reduce((s, [, d]) => s + d.count, 0)} citations</span>
            </div>
            {domains.length === 0 ? (
              <p className="text-sm text-stone-500">None cited.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {domains.slice(0, 10).map(([domain, d]) => {
                  const href = safeHref(d.sample);
                  return (
                    <li key={domain} className="rounded-lg border border-stone-200 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-accent hover:underline">
                            {domain}
                          </a>
                        ) : (
                          <span className="truncate font-medium text-stone-900">{domain}</span>
                        )}
                        <span className="shrink-0 text-xs text-stone-500">
                          {d.aboutYou} about you · {d.count} total
                        </span>
                      </div>
                      <div className="text-xs text-stone-500">{Array.from(d.engines).join(", ")}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
