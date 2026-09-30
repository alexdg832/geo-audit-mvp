import { LoginForm } from "@/components/LoginForm";
import { Card } from "@/components/ui/Card";
import { siteConfig } from "@config/site";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Where to go after login (set by pages that bounced an email deep link here); loginAction validates it.
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          {siteConfig.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">Log in to your dashboard</h1>
      </div>
      <Card>
        <LoginForm next={next} />
      </Card>
    </main>
  );
}
