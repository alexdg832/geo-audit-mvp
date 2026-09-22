import Link from "next/link";
import { siteConfig } from "@config/site";
import { AuditForm } from "@/components/AuditForm";
import { GeoTerm } from "@/components/GeoTerm";
import { Card } from "@/components/ui/Card";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex justify-end px-6 py-4">
        <Link
          href="/admin/login"
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-600 hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900"
        >
          Admin login
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className="w-full max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
            {siteConfig.name}
          </p>
          <h1 className="text-4xl font-bold text-stone-900 sm:text-5xl">{siteConfig.slogan}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600">
            <GeoTerm /> audits check how AI assistants describe your business today, grade the
            sources they&apos;re pulling from, and show you exactly what to fix.
          </p>
        </div>

        <Card className="mt-10 w-full max-w-md">
          <AuditForm />
        </Card>
      </main>
    </div>
  );
}
