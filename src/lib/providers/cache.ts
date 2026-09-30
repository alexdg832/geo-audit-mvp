import { prisma } from "@/lib/db";
import { sha256, utcDay } from "./limits";
import type { EngineId, ProviderResponse } from "./types";

export function promptCacheKey(prompt: string, location: string | null): string {
  return sha256(`${prompt.trim().toLowerCase()}\n${(location ?? "").trim().toLowerCase()}`);
}

export interface CacheLookup {
  engine: EngineId;
  promptHash: string;
  runIndex: number;
  day?: string;
}

export async function getCachedResponse(lookup: CacheLookup): Promise<ProviderResponse | null> {
  const row = await prisma.providerCache.findUnique({
    where: {
      engine_promptHash_day_runIndex: {
        engine: lookup.engine,
        promptHash: lookup.promptHash,
        day: lookup.day ?? utcDay(),
        runIndex: lookup.runIndex,
      },
    },
  });
  if (!row) return null;
  return row.response as unknown as ProviderResponse;
}

export async function setCachedResponse(lookup: CacheLookup, response: ProviderResponse): Promise<void> {
  const day = lookup.day ?? utcDay();
  await prisma.providerCache.upsert({
    where: { engine_promptHash_day_runIndex: { engine: lookup.engine, promptHash: lookup.promptHash, day, runIndex: lookup.runIndex } },
    create: {
      engine: lookup.engine,
      promptHash: lookup.promptHash,
      day,
      runIndex: lookup.runIndex,
      model: response.model,
      response: JSON.parse(JSON.stringify(response)),
    },
    update: {},
  });
}

export async function recordProviderEvent(input: {
  engine: EngineId;
  kind: "health" | "query" | "error";
  ok: boolean;
  message?: string | null;
  latencyMs?: number | null;
}): Promise<void> {
  try {
    await prisma.providerEvent.create({
      data: {
        engine: input.engine,
        kind: input.kind,
        ok: input.ok,
        message: input.message ? input.message.slice(0, 500) : null,
        latencyMs: input.latencyMs ?? null,
      },
    });
  } catch {
    // telemetry must never break a scan
  }
}
