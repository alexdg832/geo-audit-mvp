export interface RobotsRule {
  allow: boolean;
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}

/** AI-related user-agents we evaluate, with the product each one serves. */
export const AI_USER_AGENTS: { agent: string; owner: string; purpose: string }[] = [
  { agent: "GPTBot", owner: "OpenAI", purpose: "training" },
  { agent: "OAI-SearchBot", owner: "OpenAI", purpose: "search index (ChatGPT search)" },
  { agent: "ChatGPT-User", owner: "OpenAI", purpose: "user-triggered fetch" },
  { agent: "ClaudeBot", owner: "Anthropic", purpose: "training" },
  { agent: "Claude-SearchBot", owner: "Anthropic", purpose: "search index" },
  { agent: "Claude-User", owner: "Anthropic", purpose: "user-triggered fetch" },
  { agent: "PerplexityBot", owner: "Perplexity", purpose: "search index" },
  { agent: "Perplexity-User", owner: "Perplexity", purpose: "user-triggered fetch" },
  { agent: "Google-Extended", owner: "Google", purpose: "Gemini training and grounding control" },
  { agent: "Googlebot", owner: "Google", purpose: "search index (AI Overviews, AI Mode)" },
  { agent: "Bingbot", owner: "Microsoft", purpose: "search index (Copilot, some ChatGPT results)" },
  { agent: "Applebot-Extended", owner: "Apple", purpose: "training" },
  { agent: "CCBot", owner: "Common Crawl", purpose: "training corpus" },
  { agent: "Amazonbot", owner: "Amazon", purpose: "Alexa" },
  { agent: "Meta-ExternalAgent", owner: "Meta", purpose: "training" },
  { agent: "Bytespider", owner: "ByteDance", purpose: "training" },
];

/** Parses robots.txt into user-agent groups per RFC 9309 grouping rules. */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (!current) continue;
      current.rules.push({ allow: key === "allow", path: value });
      continue;
    }
    lastWasAgent = false;
  }

  return { groups, sitemaps };
}

function patternToRegex(pattern: string): RegExp {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += ".*";
    else if (ch === "$") re += "$";
    else re += ch.replace(/[.+?^{}()|[\]\\/]/g, "\\$&");
  }
  return new RegExp(re);
}

function findGroup(groups: RobotsGroup[], userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLength = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (agent === "*") continue;
      if ((ua === agent || ua.startsWith(agent)) && agent.length > bestLength) {
        best = group;
        bestLength = agent.length;
      }
    }
  }
  if (best) return best;
  return groups.find((g) => g.agents.includes("*")) ?? null;
}

/**
 * Evaluates whether a user-agent may fetch a path: the most specific matching
 * group applies, the longest matching rule wins, and ties favour Allow.
 */
export function isAllowed(robots: ParsedRobots, userAgent: string, path = "/"): boolean {
  const group = findGroup(robots.groups, userAgent);
  if (!group) return true;
  let winner: RobotsRule | null = null;
  let winnerLength = -1;
  for (const rule of group.rules) {
    if (rule.path === "") {
      if (!rule.allow && winnerLength < 0) winner = { allow: true, path: "" };
      continue;
    }
    if (!patternToRegex(rule.path).test(path)) continue;
    const length = rule.path.length;
    if (length > winnerLength || (length === winnerLength && rule.allow && winner && !winner.allow)) {
      winner = rule;
      winnerLength = length;
    }
  }
  return winner ? winner.allow : true;
}

/** True when the group that applies to this agent is a dedicated block, not the wildcard. */
export function hasDedicatedGroup(robots: ParsedRobots, userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return robots.groups.some((g) => g.agents.some((a) => a !== "*" && (ua === a || ua.startsWith(a))));
}
