import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { summarize } from "@/lib/scan/engine";
import { AuditProgress, ScanProgress } from "@/components/AuditProgress";

export default async function AuditRunningPage({ params }: PageProps<"/audit/[id]/running">) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { business: true },
  });
  if (!audit) notFound();
  if (audit.status === "complete") redirect(`/audit/${id}/results`);

  const isScan = Boolean(audit.scanVersion);
  const initial = isScan ? await summarize(id) : null;
  let legacySteps: unknown = [];
  try {
    legacySteps = JSON.parse(audit.stepsJson);
  } catch {
    legacySteps = [];
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-stone-900">Auditing {audit.business.name}</h1>
        <p className="mt-2 text-stone-600">
          {isScan
            ? "We ask four AI engines the questions your customers ask, twice each, and trace every source. This usually takes 2–5 minutes."
            : "This takes about a minute — we'll take you straight to your results."}
        </p>
      </div>
      <div className="mt-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        {isScan && initial ? (
          <ScanProgress auditId={id} initial={initial} />
        ) : (
          <AuditProgress auditId={id} initialSteps={legacySteps as never} />
        )}
      </div>
    </main>
  );
}
