"use client";

import { useActionState } from "react";
import { sendNotificationAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function SendNotificationForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(
    sendNotificationAction.bind(null, businessId),
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-stone-700">
          Message to send the client
        </label>
        <textarea id="message" name="message" rows={2} required className={inputClass} />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send notification"}
      </Button>
    </form>
  );
}
