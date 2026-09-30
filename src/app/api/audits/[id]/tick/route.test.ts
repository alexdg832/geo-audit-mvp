import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { engine } = vi.hoisted(() => ({ engine: { advanceScan: vi.fn() } }));

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/scan/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scan/engine")>()),
  advanceScan: engine.advanceScan,
}));

import { ScanRequestError } from "@/lib/scan/engine";
import { POST } from "./route";

function post(id: string) {
  return POST(new Request(`http://localhost/api/audits/${id}/tick`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/audits/[id]/tick", () => {
  it("returns the fixed refusal message and status for a ScanRequestError", async () => {
    engine.advanceScan.mockRejectedValue(new ScanRequestError("Audit not found"));
    const res = await post("missing");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Audit not found" });
  });

  it("never echoes an unexpected error to the caller", async () => {
    const raw = "Invalid `prisma.audit.findUnique()` invocation: Can't reach database server at `ep-xxxx.us-east-2.aws.neon.tech:5432`";
    engine.advanceScan.mockRejectedValue(new Error(raw));
    const res = await post("a1");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Tick failed" });
    expect(console.error).toHaveBeenCalledWith("Scan tick failed", { auditId: "a1", message: raw });
  });

  it("passes a successful tick through", async () => {
    engine.advanceScan.mockResolvedValue({ auditId: "a1", status: "running" });
    const res = await post("a1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ auditId: "a1" });
  });
});
