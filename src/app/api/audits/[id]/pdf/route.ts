import { renderToBuffer } from "@react-pdf/renderer";
import { isAdmin } from "@/lib/auth/session";
import { loadReport } from "@/lib/report/load";
import { ReportPdf } from "@/lib/report/pdf";

export const maxDuration = 60;

export async function GET(_request: Request, ctx: RouteContext<"/api/audits/[id]/pdf">) {
  const { id } = await ctx.params;
  const data = await loadReport(id);
  if (!data) return new Response("Report not found", { status: 404 });
  const unlocked = data.hasAccount || (await isAdmin());

  const buffer = await renderToBuffer(ReportPdf({ data, unlocked }));
  const filename = `geo-audit-${data.audit.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report"}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
