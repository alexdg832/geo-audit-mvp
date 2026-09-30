import { NextResponse } from "next/server";
import { advanceScan, ScanRequestError } from "@/lib/scan/engine";

export const maxDuration = 120;

export async function POST(_request: Request, ctx: RouteContext<"/api/audits/[id]/tick">) {
  const { id } = await ctx.params;
  try {
    const result = await advanceScan(id);
    return NextResponse.json(result);
  } catch (err) {
    // This route is unauthenticated: only fixed strings go back to the caller, since a raw
    // exception can name the database host or quote a provider's response.
    if (err instanceof ScanRequestError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Scan tick failed", { auditId: id, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Tick failed" }, { status: 500 });
  }
}
