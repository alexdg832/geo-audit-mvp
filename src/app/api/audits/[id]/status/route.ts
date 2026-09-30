import { NextResponse } from "next/server";
import { ScanRequestError, summarize } from "@/lib/scan/engine";

export async function GET(_request: Request, ctx: RouteContext<"/api/audits/[id]/status">) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await summarize(id));
  } catch (err) {
    // Unauthenticated route: only fixed strings go back, a raw exception can name the database host.
    if (err instanceof ScanRequestError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Scan status failed", { auditId: id, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Status unavailable" }, { status: 500 });
  }
}
