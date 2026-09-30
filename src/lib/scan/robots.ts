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
      // A bare "User-agent:" names nobody; keeping "" would make every agent
      // prefix-match it and beat the wildcard group.
      if (value) current.agents.push(value.toLowerCase());
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

/**
 * Returns the rules that apply to a user-agent, or null when no group matches.
 * RFC 9309 §2.2.1: every group naming the winning token (or every wildcard
 * group on fallback) is combined, so a second "User-agent: GPTBot" block adds
 * to the first instead of being silently dropped.
 */
function matchingRules(groups: RobotsGroup[], userAgent: string): RobotsRule[] | null {
  const ua = userAgent.toLowerCase();
  let bestToken: string | null = null;
  for (const group of groups) {
    for (const agent of group.agents) {
      if (!agent || agent === "*") continue;
      if ((ua === agent || ua.startsWith(agent)) && (bestToken === null || agent.length > bestToken.length)) {
        bestToken = agent;
      }
    }
  }
  const token = bestToken ?? "*";
  const matched = groups.filter((g) => g.agents.includes(token));
  if (matched.length === 0) return null;
  return matched.flatMap((g) => g.rules);
}

/**
 * Evaluates whether a user-agent may fetch a path: the most specific matching
 * group applies, the longest matching rule wins, and ties favour Allow.
 */
export function isAllowed(robots: ParsedRobots, userAgent: string, path = "/"): boolean {
  const rules = matchingRules(robots.groups, userAgent);
  if (!rules) return true;
  let winner: RobotsRule | null = null;
  let winnerLength = -1;
  for (const rule of rules) {
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
  return robots.groups.some((g) => g.agents.some((a) => a && a !== "*" && (ua === a || ua.startsWith(a))));
}
