import Link from "next/link";
import { adminLogoutAction } from "@/lib/actions/adminAuth";

const LINKS = [
  { href: "/admin", label: "Clients" },
  { href: "/admin/scans", label: "Scans" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/providers", label: "Provider status" },
];

export function AdminNav({ title }: { title: string }) {
  return (
    <header className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Admin</p>
          <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        </div>
        <form action={adminLogoutAction}>
          <button className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700">Log out</button>
        </form>
      </div>
      <nav aria-label="Admin sections" className="mt-4 flex gap-4 border-b border-stone-200 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="-mb-px border-b-2 border-transparent pb-2 text-stone-600 hover:border-stone-400 hover:text-stone-900">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
