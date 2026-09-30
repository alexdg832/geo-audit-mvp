import { NextResponse } from "next/server";
import { advanceScan } from "@/lib/scan/engine";

export const maxDuration = 120;

export async function POST(_request: Request, ctx: RouteContext<"/api/audits/[id]/tick">) {
  const { id } = await ctx.params;
  try {
    const result = await advanceScan(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tick failed";
    const status = /not found|not a scan/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
