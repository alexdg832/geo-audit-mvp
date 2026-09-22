"use client";

import { useActionState } from "react";
import { adminLoginAction } from "@/lib/actions/adminAuth";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "./ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLoginAction, initialActionState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-stone-700">
          Admin password
        </label>
        <input id="password" name="password" type="password" required className={inputClass} />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Enter admin dashboard"}
      </Button>
    </form>
  );
}
