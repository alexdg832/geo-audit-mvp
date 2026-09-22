"use client";

import { updateContentPushStatusAction } from "@/lib/actions/admin";

export function ContentPushStatusSelect({
  pushId,
  businessId,
  currentStatus,
}: {
  pushId: string;
  businessId: string;
  currentStatus: string;
}) {
  return (
    <form action={updateContentPushStatusAction.bind(null, pushId, businessId)}>
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-stone-300 px-2 py-1 text-sm text-stone-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="Planned">Planned</option>
        <option value="In Progress">In Progress</option>
        <option value="Published">Published</option>
      </select>
    </form>
  );
}
