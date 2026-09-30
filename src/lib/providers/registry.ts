import { prisma } from "@/lib/db";
import { createAnthropicProvider } from "./anthropic";
import { createGeminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import { createOpenAIProvider } from "./openai";
import { createPerplexityProvider } from "./perplexity";
import { type AIProvider, ENGINE_LABELS, type EngineId, LIVE_ENGINE_IDS, type ProviderStatus } from "./types";

const KEY_ENV: Record<Exclude<EngineId, "mock">, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "CLAUDE_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

export interface ProviderInfo {
  id: EngineId;
  label: string;
  status: ProviderStatus;
  model: string | null;
  keyEnv: string | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastOkAt: Date | null;
}

export function isMockMode(): boolean {
  return process.env.MOCK_MODE === "true";
}

/** Mock fixtures must never reach a deployed environment. */
export function assertMockAllowed(): void {
  if (!isMockMode()) return;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") {
    throw new Error("MOCK_MODE=true is not allowed on a deployed environment. Remove the variable to run real scans.");
  }
}

function keyFor(id: Exclude<EngineId, "mock">): string | null {
  const value = process.env[KEY_ENV[id]];
  return value && value.trim() ? value.trim() : null;
}

function build(id: Exclude<EngineId, "mock">, key: string): AIProvider {
  switch (id) {
    case "openai":
      return createOpenAIProvider(key);
    case "anthropic":
      return createAnthropicProvider(key);
    case "gemini":
      return createGeminiProvider(key);
    case "perplexity":
      return createPerplexityProvider(key);
  }
}

/** Adapters for every engine whose key is present; only the mock engine under MOCK_MODE. */
export function getProviders(): AIProvider[] {
  if (isMockMode()) {
    assertMockAllowed();
    return [mockProvider];
  }
  const providers: AIProvider[] = [];
  for (const id of LIVE_ENGINE_IDS) {
    const key = keyFor(id);
    if (key) providers.push(build(id, key));
  }
  return providers;
}

export function getProvider(id: EngineId): AIProvider | null {
  if (id === "mock") return isMockMode() ? mockProvider : null;
  const key = keyFor(id);
  return key ? build(id, key) : null;
}

/** The cheapest configured engine that can run a search-free completion, used to classify answers. */
export function getClassifier(exclude: EngineId[] = []): AIProvider | null {
  if (isMockMode()) return mockProvider;
  for (const id of ["openai", "anthropic", "gemini"] as const) {
    if (exclude.includes(id)) continue;
    const key = keyFor(id);
    if (key) return build(id, key);
  }
  return null;
}

/** Configured engines plus their most recent success and error, for the admin panel and scan bookkeeping. */
export async function listProviderStatus(): Promise<ProviderInfo[]> {
  const ids: EngineId[] = isMockMode() ? ["mock"] : [...LIVE_ENGINE_IDS];
  const events = await prisma.providerEvent.findMany({
    where: { engine: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ids.map((id) => {
    const key = id === "mock" ? "mock" : keyFor(id);
    const lastError = events.find((e) => e.engine === id && !e.ok) ?? null;
    const lastOk = events.find((e) => e.engine === id && e.ok) ?? null;
    let status: ProviderStatus = key ? "live" : "not_configured";
    if (key && lastError && (!lastOk || lastError.createdAt > lastOk.createdAt)) status = "error";
    const provider = key ? getProvider(id) : null;
    return {
      id,
      label: ENGINE_LABELS[id],
      status,
      model: provider?.model ?? null,
      keyEnv: id === "mock" ? "MOCK_MODE" : KEY_ENV[id],
      lastError: lastError?.message ?? null,
      lastErrorAt: lastError?.createdAt ?? null,
      lastOkAt: lastOk?.createdAt ?? null,
    };
  });
}
