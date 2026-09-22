import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AuditProgress } from "@/components/AuditProgress";

export default async function AuditRunningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { business: true },
  });
  if (!audit) notFound();
  if (audit.status === "complete") redirect(`/audit/${id}/results`);

  const steps = JSON.parse(audit.stepsJson);

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-stone-900">Auditing {audit.business.name}</h1>
        <p className="mt-2 text-stone-600">
          This takes about a minute — we&apos;ll take you straight to your results.
        </p>
      </div>
      <div className="mt-10 w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <AuditProgress auditId={id} initialSteps={steps} />
      </div>
    </main>
  );
}
