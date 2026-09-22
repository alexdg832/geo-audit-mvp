import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ContactOrSkipForm } from "@/components/ContactOrSkipForm";
import { Card } from "@/components/ui/Card";

export default async function ContactOrSkipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const audit = await prisma.audit.findUnique({
    where: { id },
    include: { business: { include: { users: true } } },
  });
  if (!audit) notFound();
  if (audit.business.users.length > 0) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-stone-900">One last step</h1>
        <p className="mt-2 text-stone-600">
          Create your account to save these results and see your dashboard.
        </p>
      </div>
      <Card>
        <ContactOrSkipForm auditId={id} />
      </Card>
    </main>
  );
}
