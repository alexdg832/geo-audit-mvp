import { NextResponse } from "next/server";
import { summarize } from "@/lib/scan/engine";

export async function GET(_request: Request, ctx: RouteContext<"/api/audits/[id]/status">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await summarize(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status unavailable";
    return NextResponse.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
