import { describe, expect, it } from "vitest";
import { hasDedicatedGroup, isAllowed, parseRobots } from "./robots";

const WORDPRESS_WITH_GPTBOT_BLOCK = `
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

User-agent: GPTBot
Disallow: /

Sitemap: https://example.com/sitemap_index.xml
`;

describe("parseRobots", () => {
  it("groups consecutive user-agent lines and collects sitemaps", () => {
    const parsed = parseRobots(`User-agent: a\nUser-agent: b\nDisallow: /x\n\nUser-agent: c\nAllow: /\nSitemap: https://e.com/s.xml`);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].agents).toEqual(["a", "b"]);
    expect(parsed.groups[0].rules).toEqual([{ allow: false, path: "/x" }]);
    expect(parsed.sitemaps).toEqual(["https://e.com/s.xml"]);
  });

  it("starts a new group when a user-agent line follows rules", () => {
    const parsed = parseRobots(WORDPRESS_WITH_GPTBOT_BLOCK);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[1].agents).toEqual(["gptbot"]);
  });
});

describe("isAllowed", () => {
  const robots = parseRobots(WORDPRESS_WITH_GPTBOT_BLOCK);

  it("blocks only the bot with a dedicated Disallow: /", () => {
    expect(isAllowed(robots, "GPTBot")).toBe(false);
    expect(isAllowed(robots, "ClaudeBot")).toBe(true);
    expect(isAllowed(robots, "PerplexityBot")).toBe(true);
  });

  it("falls back to the wildcard group for unknown agents", () => {
    expect(isAllowed(robots, "ClaudeBot", "/wp-admin/")).toBe(false);
    expect(isAllowed(robots, "ClaudeBot", "/wp-admin/admin-ajax.php")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), "GPTBot")).toBe(true);
  });

  it("allows everything when there is no matching group", () => {
    expect(isAllowed(parseRobots("User-agent: Bingbot\nDisallow: /"), "GPTBot")).toBe(true);
  });

  it("supports wildcards and end anchors", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /private*");
    expect(isAllowed(r, "GPTBot", "/docs/file.pdf")).toBe(false);
    expect(isAllowed(r, "GPTBot", "/docs/file.pdfx")).toBe(true);
    expect(isAllowed(r, "GPTBot", "/private-area/x")).toBe(false);
    expect(isAllowed(r, "GPTBot", "/")).toBe(true);
  });

  it("prefers Allow on equal-length matches", () => {
    const r = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a");
    expect(isAllowed(r, "GPTBot", "/a")).toBe(true);
  });

  it("matches agents case-insensitively and by product prefix", () => {
    const r = parseRobots("User-agent: claudebot\nDisallow: /");
    expect(isAllowed(r, "ClaudeBot/1.0")).toBe(false);
    expect(hasDedicatedGroup(r, "ClaudeBot")).toBe(true);
    expect(hasDedicatedGroup(r, "GPTBot")).toBe(false);
  });
});
