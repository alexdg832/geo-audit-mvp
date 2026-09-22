"use client";

import { useActionState } from "react";
import { createContentPushAction } from "@/lib/actions/admin";
import { initialActionState } from "@/lib/actions/types";
import { Button } from "@/components/ui/Button";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 px-4 py-2.5 text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function ContentPushForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState(
    createContentPushAction.bind(null, businessId),
    initialActionState
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-stone-700">
          Title
        </label>
        <input id="title" name="title" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="type" className="block text-sm font-medium text-stone-700">
          Type
        </label>
        <select id="type" name="type" required className={inputClass}>
          <option value="Website FAQ/Schema update">Website FAQ/Schema update</option>
          <option value="Press release">Press release</option>
          <option value="Directory listing">Directory listing</option>
          <option value="Knowledge profile">Knowledge profile</option>
          <option value="Blog article">Blog article</option>
        </select>
      </div>
      <div>
        <label htmlFor="targetChannel" className="block text-sm font-medium text-stone-700">
          Target channel or URL
        </label>
        <input id="targetChannel" name="targetChannel" className={inputClass} />
      </div>
      <div>
        <label htmlFor="contentBody" className="block text-sm font-medium text-stone-700">
          Content
        </label>
        <textarea id="contentBody" name="contentBody" rows={4} className={inputClass} />
      </div>
      <div>
        <label htmlFor="status" className="block text-sm font-medium text-stone-700">
          Status
        </label>
        <select id="status" name="status" defaultValue="Planned" className={inputClass}>
          <option value="Planned">Planned</option>
          <option value="In Progress">In Progress</option>
          <option value="Published">Published</option>
        </select>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create push"}
      </Button>
    </form>
  );
}
