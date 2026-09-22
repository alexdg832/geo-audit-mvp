import { AdminLoginForm } from "@/components/AdminLoginForm";
import { Card } from "@/components/ui/Card";

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Admin</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">Admin access</h1>
      </div>
      <Card>
        <AdminLoginForm />
      </Card>
    </main>
  );
}
