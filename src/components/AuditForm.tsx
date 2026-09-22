"use client";

import { useActionState } from "react";
import { startAuditAction } from "@/lib/actions/audit";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "./ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function AuditForm() {
  const [state, formAction, pending] = useActionState(startAuditAction, initialActionState);

  return (
    <form action={formAction} className="w-full space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-stone-700">
          Business name *
        </label>
        <input id="name" name="name" required placeholder="Acme Plumbing" className={inputClass} />
      </div>
      <div>
        <label htmlFor="website" className="block text-sm font-medium text-stone-700">
          Website (optional)
        </label>
        <input id="website" name="website" placeholder="acmeplumbing.com" className={inputClass} />
      </div>
      <div>
        <label htmlFor="location" className="block text-sm font-medium text-stone-700">
          Location (optional)
        </label>
        <input id="location" name="location" placeholder="Austin, TX" className={inputClass} />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Starting…" : "Run my free audit"}
      </Button>
    </form>
  );
}
