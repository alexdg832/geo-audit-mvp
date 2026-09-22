import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_MAX } from "@/lib/audit/score";
import { AiSnippetPart, WebsiteCheckResult } from "@/lib/audit/types";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CategoryBar } from "@/components/CategoryBar";
import { AiSnippetBlock } from "@/components/AiSnippetBlock";
import { SourceTierList } from "@/components/SourceTierList";
import { WebsiteChecklist } from "@/components/WebsiteChecklist";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { GeoTerm } from "@/components/GeoTerm";

export default async function AuditResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { business: { include: { users: true } }, mentions: true },
  });
  if (!audit) notFound();
  if (audit.status !== "complete") redirect(`/audit/${id}/running`);

  const websiteChecks = JSON.parse(audit.websiteChecksJson ?? "{}") as WebsiteCheckResult;
  const aiSnippet = JSON.parse(audit.aiSnippetJson ?? "[]") as AiSnippetPart[];
  const recommendations = JSON.parse(audit.recommendationsJson ?? "[]") as string[];
  const hasAccount = audit.business.users.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          {audit.business.name}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-stone-900">Your GEO audit results</h1>
        <p className="mt-2 text-stone-600">
          Here&apos;s how AI assistants currently see your business, and what&apos;s shaping that
          view.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <ScoreGauge score={audit.score ?? 0} />
      </div>

      <Card className="mt-8 space-y-5">
        <h2 className="text-lg font-semibold text-stone-900">Score breakdown</h2>
        <CategoryBar
          label="Source Trust"
          score={audit.sourceTrustScore ?? 0}
          max={CATEGORY_MAX.sourceTrust}
          tooltip="Share of mentions coming from authoritative vs. low-trust sources."
        />
        <CategoryBar
          label="Consistency"
          score={audit.consistencyScore ?? 0}
          max={CATEGORY_MAX.consistency}
          tooltip="Whether your name, address, phone, and description match across sources."
        />
        <CategoryBar
          label="Website AI Readiness"
          score={audit.aiReadinessScore ?? 0}
          max={CATEGORY_MAX.aiReadiness}
          tooltip="Whether your website is set up for AI crawlers to read and understand."
        />
        <CategoryBar
          label="AI Visibility"
          score={audit.aiVisibilityScore ?? 0}
          max={CATEGORY_MAX.aiVisibility}
          tooltip="Whether AI assistants mention you at all, and how accurately."
        />
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">What AI currently says about you</h2>
        <div className="mt-3">
          <AiSnippetBlock parts={aiSnippet} />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Website AI readiness details</h2>
        <div className="mt-3">
          <WebsiteChecklist checks={websiteChecks} />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Sources we found</h2>
        <div className="mt-3">
          <SourceTierList mentions={audit.mentions} />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900">Top fixes</h2>
        <ol className="mt-3 space-y-2">
          {recommendations.map((rec, i) => (
            <li key={i} className="flex gap-3 text-sm text-stone-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {i + 1}
              </span>
              <span>{rec}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-10 flex flex-col items-center gap-3">
        {hasAccount ? (
          <LinkButton href="/dashboard" className="w-full max-w-xs">
            Back to dashboard
          </LinkButton>
        ) : (
          <LinkButton href={`/audit/${id}/contact`} className="w-full max-w-xs">
            Fix this with us
          </LinkButton>
        )}
        <p className="text-xs text-stone-500">
          Curious what <GeoTerm /> actually changes? We turn these fixes into real content and
          source-building work.
        </p>
      </div>
    </main>
  );
}
