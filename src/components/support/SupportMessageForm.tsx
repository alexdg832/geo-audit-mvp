"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { initialActionState, type ActionState } from "@/lib/actions/types";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type Props = {
  /** A Server Action (optionally pre-bound), so the form also works before JavaScript loads. */
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  withSubject?: boolean;
  submitLabel: string;
  placeholder?: string;
  note?: string;
};

export function SupportMessageForm({ action, withSubject = false, submitLabel, placeholder, note }: Props) {
  const [state, formAction, pending] = useActionState(action, initialActionState);

  return (
    // The nonce changes on each successful send, which remounts the fields and clears them.
    <form key={state.nonce ?? 0} action={formAction} className="space-y-3">
      {withSubject && (
        <div>
          <label htmlFor="support-subject" className="block text-sm font-medium text-stone-700">
            Subject
          </label>
          <input id="support-subject" name="subject" required maxLength={200} className={inputClass} placeholder="A few words about what this is" />
        </div>
      )}
      <div>
        <label htmlFor="support-message" className="block text-sm font-medium text-stone-700">
          Message
        </label>
        <textarea id="support-message" name="message" required rows={4} maxLength={5000} className={inputClass} placeholder={placeholder} />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">{state.success}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : submitLabel}
        </Button>
        {note && <p className="text-xs text-stone-500">{note}</p>}
      </div>
    </form>
  );
}
