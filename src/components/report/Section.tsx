import { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function Section({ id, title, intro, children, className = "" }: { id: string; title: string; intro?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-24 ${className}`}>
      <Card>
        <h2 id={`${id}-title`} className="text-lg font-semibold text-stone-900">
          {title}
        </h2>
        {intro && <p className="mt-1 text-sm text-stone-600">{intro}</p>}
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  );
}

export const REPORT_SECTIONS: { id: string; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "critical", label: "Critical failures" },
  { id: "pillars", label: "Pillar breakdown" },
  { id: "evidence", label: "Evidence" },
  { id: "competitors", label: "Competitors" },
  { id: "sources", label: "Source map" },
  { id: "cost", label: "Cost of inaction" },
  { id: "roadmap", label: "Roadmap" },
  { id: "methodology", label: "How we score" },
];

export function ReportNav() {
  return (
    <nav aria-label="Report sections" className="sticky top-0 z-10 -mx-6 mb-6 border-b border-stone-200 bg-[var(--background)]/95 px-6 py-2 backdrop-blur print:hidden">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {REPORT_SECTIONS.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="text-stone-600 hover:text-stone-900 hover:underline">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
