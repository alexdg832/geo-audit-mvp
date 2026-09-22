import { adminLogoutAction } from "@/lib/actions/adminAuth";

export function AdminNav({ title }: { title: string }) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Admin</p>
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      </div>
      <form action={adminLogoutAction}>
        <button className="text-sm text-stone-500 underline underline-offset-2 hover:text-stone-700">
          Log out
        </button>
      </form>
    </header>
  );
}
