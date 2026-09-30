import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { AIProvider, EngineId, ProviderResponse } from "@/lib/providers/types";
import { providerHttpError } from "@/lib/providers/types";

type MockDb = { [model: string]: { [method: string]: Mock } } & { $transaction: Mock; $queryRaw: Mock };

// A Prisma stand-in: every `prisma.<model>.<method>` is a lazily created vi.fn() with a
// sensible empty default, so each test only overrides the calls it cares about.
const { db, registry, notifications } = vi.hoisted(() => {
  const defaults: Record<string, unknown> = {
    findUnique: null,
    findFirst: null,
    findMany: [],
    count: 0,
    groupBy: [],
    updateMany: { count: 1 },
    deleteMany: { count: 0 },
    createMany: { count: 0 },
    update: {},
    create: {},
    upsert: {},
  };
  const stores = new Map<string, Record<string, Mock>>();
  const model = (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = {};
      stores.set(name, store);
    }
    const fns = store;
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "fields") return new Proxy({}, { get: (_f, field) => ({ ref: field }) });
        if (!fns[prop]) fns[prop] = vi.fn(async () => defaults[prop] ?? null);
        return fns[prop];
      },
    });
  };
  const transaction = vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => unknown)(db)));
  const queryRaw = vi.fn(async () => []);
  const db = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "$transaction") return transaction;
      if (prop === "$queryRaw") return queryRaw;
      return model(prop);
    },
  }) as unknown as MockDb;
  return {
    db,
    registry: { getProviders: vi.fn(() => [] as unknown[]), getClassifier: vi.fn(() => null as unknown) },
    notifications: { notifyBusinessUsers: vi.fn(async () => undefined) },
  };
});

vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/lib/providers/registry", () => ({
  getProviders: registry.getProviders,
  getClassifier: registry.getClassifier,
  isMockMode: () => false,
  assertMockAllowed: () => undefined,
}));
vi.mock("@/lib/notifications", () => ({ notifyBusinessUsers: notifications.notifyBusinessUsers }));

import { advanceScan, checkRerunCooldown, MAX_ATTEMPTS, sanitizeInlineText, ScanRequestError } from "./engine";

const ANSWER: ProviderResponse = {
  engine: "openai",
  model: "gpt-5",
  answerText: "Acme Dojo is a well-reviewed karate school in Irvine. Summit Karate is another option.",
  citations: [],
  latencyMs: 12,
  rawResponse: {},
};

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    businessId: "b1",
    status: "running",
    stage: "queries",
    scanVersion: "2026.09.30",
    isMock: false,
    resolvedName: "Acme Dojo",
    resolvedWebsite: "https://acme.test",
    resolvedDomain: "acme.test",
    resolvedLocation: "Irvine, CA",
    category: "karate school",
    runsPerPrompt: 2,
    maxProviderCalls: 120,
    providerCallsUsed: 0,
    error: null,
    engines: [{ id: "e1", auditId: "a1", engine: "openai", status: "live", model: "gpt-5", callsMade: 0, error: null }],
    ...overrides,
  };
}

function provider(id: EngineId, overrides: Partial<AIProvider> = {}): AIProvider {
  return { id, label: id, model: `${id}-model`, query: vi.fn(async () => ANSWER), health: async () => ({ ok: true }), ...overrides };
}

function unit(id: string, engine = "openai", attempts = 1) {
  return { id, promptId: "p1", engine, runIndex: 0, attempts };
}

function calls(mock: Mock): Record<string, Record<string, unknown>>[] {
  return mock.mock.calls.map((c) => c[0] as Record<string, Record<string, unknown>>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sanitizeInlineText", () => {
  it("strips line breaks and tabs and collapses whitespace", () => {
    expect(sanitizeInlineText("Acme\r\nDojo\t  Inc  ", 200)).toBe("Acme Dojo Inc");
    expect(sanitizeInlineText("Subject: x\nBcc: someone@example.test", 200)).toBe("Subject: x Bcc: someone@example.test");
    expect(sanitizeInlineText("abcdef", 3)).toBe("abc");
  });
});

describe("advanceScan request errors", () => {
  it("throws a fixed-message ScanRequestError for unknown or legacy audits", async () => {
    db.audit.findUnique.mockResolvedValue(null);
    await expect(advanceScan("nope")).rejects.toBeInstanceOf(ScanRequestError);
    db.audit.findUnique.mockResolvedValue(auditRow({ scanVersion: null }));
    await expect(advanceScan("a1")).rejects.toMatchObject({ message: "Audit is not a scan-engine audit", status: 404 });
  });
});

describe("query stage", () => {
  beforeEach(() => {
    db.audit.findUnique.mockResolvedValue(auditRow());
    db.scanPrompt.findMany.mockResolvedValue([{ id: "p1", auditId: "a1", index: 0, kind: "recommendation", text: "Best karate school in Irvine?" }]);
  });

  it("fails orphaned units before claiming so the stage can finish", async () => {
    db.$queryRaw.mockResolvedValue([]);
    db.engineRun.count.mockResolvedValue(0);

    await advanceScan("a1");

    const sweep = calls(db.engineRun.updateMany).find((c) => c.data.status === "failed");
    expect(sweep).toBeDefined();
    expect(sweep!.where).toMatchObject({ auditId: "a1", status: "running", attempts: { gte: MAX_ATTEMPTS } });
    expect(sweep!.data.error).toBe(`Exceeded ${MAX_ATTEMPTS} attempts`);
    // The sweep must land before the claim, otherwise the orphan is still counted as remaining.
    expect(db.engineRun.updateMany.mock.invocationCallOrder[0]).toBeLessThan(db.$queryRaw.mock.invocationCallOrder[0]);
    expect(calls(db.audit.updateMany).some((c) => c.data.stage === "finalize")).toBe(true);
  });

  it("reserves the call cap atomically and skips the unit when the reservation fails", async () => {
    const openai = provider("openai");
    registry.getProviders.mockReturnValue([openai]);
    db.$queryRaw.mockResolvedValue([unit("u1")]);
    db.audit.updateMany.mockResolvedValue({ count: 0 });

    await advanceScan("a1");

    expect(db.audit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1", providerCallsUsed: { lt: { ref: "maxProviderCalls" } } },
        data: { providerCallsUsed: { increment: 1 } },
      })
    );
    expect(openai.query).not.toHaveBeenCalled();
    expect(calls(db.engineRun.update)[0]).toMatchObject({ where: { id: "u1" }, data: { status: "skipped", error: "Per-scan provider call cap reached" } });
  });

  it("releases the reservation and stores only a customer-safe message when the engine fails", async () => {
    const body = "Incorrect API key provided: sk-proj-abcd…WXYZ. You can find your API key at platform.openai.com";
    const openai = provider("openai", { query: vi.fn(async () => Promise.reject(providerHttpError("openai", 401, body))) });
    registry.getProviders.mockReturnValue([openai]);
    db.$queryRaw.mockResolvedValue([unit("u1")]);

    await advanceScan("a1");

    expect(calls(db.audit.updateMany).some((c) => JSON.stringify(c.data) === JSON.stringify({ providerCallsUsed: { decrement: 1 } }))).toBe(true);
    const stored = JSON.stringify([calls(db.engineRun.update), calls(db.engineRun.updateMany), calls(db.scanEngine.updateMany)]);
    expect(stored).not.toContain("sk-proj");
    expect(stored).not.toContain("platform.openai");
    expect(calls(db.engineRun.update)[0].data).toMatchObject({ status: "failed", error: "ChatGPT rejected the API key (HTTP 401)" });
    // A key failure on the query path still trips the engine for its remaining units.
    expect(calls(db.engineRun.updateMany).find((c) => c.data.status === "skipped")?.data.error).toBe("Engine unavailable: ChatGPT rejected the API key (HTTP 401)");
    expect(calls(db.scanEngine.updateMany).find((c) => c.data.status === "error")?.data.error).toBe("ChatGPT rejected the API key (HTTP 401)");
    // The raw message is kept for the admin-only provider log.
    expect(calls(db.providerEvent.create)[0].data.message).toContain("sk-proj");
  });

  it("drops a fatally failing classifier without tripping that engine's query units", async () => {
    const openaiClassifier = provider("openai", {
      complete: vi.fn(async () => Promise.reject(providerHttpError("openai", 404, "The model 'gpt-5-mini' does not exist or you do not have access to it"))),
    });
    const anthropicClassifier = provider("anthropic", {
      complete: vi.fn(async () => ({ engine: "anthropic" as const, model: "haiku", text: "{}", latencyMs: 5 })),
    });
    registry.getClassifier.mockImplementation((exclude?: unknown) => ((exclude as string[]).includes("openai") ? anthropicClassifier : openaiClassifier));
    let queries = 0;
    const openai = provider("openai", {
      query: vi.fn(async () => {
        // The second unit answers later, so it picks its classifier after the first one failed.
        if (queries++ > 0) await new Promise((resolve) => setTimeout(resolve, 25));
        return ANSWER;
      }),
    });
    registry.getProviders.mockReturnValue([openai]);
    db.$queryRaw.mockResolvedValue([unit("u1"), unit("u2")]);

    await advanceScan("a1");

    expect(openaiClassifier.complete).toHaveBeenCalledTimes(1);
    expect(anthropicClassifier.complete).toHaveBeenCalledTimes(1);
    expect(registry.getClassifier).toHaveBeenLastCalledWith(["openai"]);
    expect(calls(db.engineRun.updateMany).some((c) => c.data.status === "skipped")).toBe(false);
    expect(calls(db.scanEngine.updateMany).some((c) => c.data.status === "error")).toBe(false);
    expect(calls(db.engineRun.update).filter((c) => c.data.status === "complete")).toHaveLength(2);
  });
});

describe("finalize stage", () => {
  beforeEach(() => {
    db.audit.findUnique.mockResolvedValue(auditRow({ stage: "finalize", engines: [] }));
  });

  it("keeps a committed report complete when the notification fails", async () => {
    notifications.notifyBusinessUsers.mockRejectedValue(new Error("Timed out fetching a new connection from the pool"));

    await advanceScan("a1");

    expect(calls(db.audit.update).some((c) => c.data.status === "complete")).toBe(true);
    expect(calls(db.audit.updateMany).some((c) => c.data.status === "failed")).toBe(false);
  });

  it("stores a generic message and guards on the running status when scoring fails", async () => {
    db.engineRun.findMany.mockRejectedValue(new Error("Can't reach database server at `ep-xxxx.us-east-2.aws.neon.tech:5432`"));

    await advanceScan("a1");

    const failed = calls(db.audit.updateMany).find((c) => c.data.status === "failed");
    expect(failed).toBeDefined();
    expect(failed!.where).toEqual({ id: "a1", status: "running" });
    expect(String(failed!.data.error)).not.toContain("neon.tech");
    expect(failed!.data.error).toBe("We could not finish scoring the evidence. Please try again later.");
  });
});

describe("checkRerunCooldown", () => {
  it("allows a re-run once the window has passed and refuses inside it", async () => {
    const now = Date.UTC(2026, 8, 30, 12, 0, 0);
    db.audit.findFirst.mockResolvedValue(null);
    expect(await checkRerunCooldown("b1", now)).toBeNull();
    expect(calls(db.audit.findFirst)[0].where).toMatchObject({ businessId: "b1", scanVersion: { not: null }, createdAt: { gte: new Date(now - 60 * 60 * 1000) } });

    db.audit.findFirst.mockResolvedValue({ createdAt: new Date(now - 10 * 60 * 1000) });
    expect(await checkRerunCooldown("b1", now)).toBe("This business was scanned less than 60 minutes ago. Please wait about 50 more minutes before re-running.");
  });
});
