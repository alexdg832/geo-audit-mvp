"use client";

import { useActionState } from "react";
import { saveTruthBriefAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

type TruthBriefValues = {
  description: string | null;
  services: string | null;
  location: string | null;
  keyFacts: string | null;
  approvedSources: string | null;
} | null;

export function TruthBriefForm({
  businessId,
  initialValues,
}: {
  businessId: string;
  initialValues: TruthBriefValues;
}) {
  const [state, formAction, pending] = useActionState(
    saveTruthBriefAction.bind(null, businessId),
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-stone-700">
          Official description
        </label>
        <p className="text-xs text-stone-500">The core, accurate description of the business.</p>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initialValues?.description ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="services" className="block text-sm font-medium text-stone-700">
          Services offered
        </label>
        <textarea
          id="services"
          name="services"
          rows={2}
          defaultValue={initialValues?.services ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="location" className="block text-sm font-medium text-stone-700">
          Location
        </label>
        <input
          id="location"
          name="location"
          defaultValue={initialValues?.location ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="keyFacts" className="block text-sm font-medium text-stone-700">
          Key facts AI should know
        </label>
        <p className="text-xs text-stone-500">
          One fact per line (founding year, certifications, service area, etc.).
        </p>
        <textarea
          id="keyFacts"
          name="keyFacts"
          rows={3}
          defaultValue={initialValues?.keyFacts ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="approvedSources" className="block text-sm font-medium text-stone-700">
          Approved sources
        </label>
        <p className="text-xs text-stone-500">
          One URL per line — sources you trust AI to cite.
        </p>
        <textarea
          id="approvedSources"
          name="approvedSources"
          rows={3}
          defaultValue={initialValues?.approvedSources ?? ""}
          className={inputClass}
        />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save Truth Brief"}
      </Button>
    </form>
  );
}
