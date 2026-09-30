# Scoring methodology

Scoring version: `1.1.0` (`SCORING_VERSION` in [src/lib/scoring/index.ts](../src/lib/scoring/index.ts)). The version is stored on every report (`Audit.scoringVersion`, `Report.scoringVersion`) so a report can always be reproduced by the code that produced it. The function is pure and deterministic: the same persisted evidence always yields the same score (covered by [src/lib/scoring/index.test.ts](../src/lib/scoring/index.test.ts)).

The research behind each criterion is in [GEO_RESEARCH.md](GEO_RESEARCH.md); its section 9 lists every criterion with the strongest source found and whether it is evidence-backed or heuristic. The labels below are those labels.

## 1. What is measured

A scan produces the evidence the score is computed from — nothing is scored that is not persisted:

| Evidence | Table | How it is collected |
|---|---|---|
| Engine answers | `EngineRun` | Each prompt is sent to every live engine `runsPerPrompt` times (default 2) with the engine's native web search or grounding. Answer text, model, latency and the raw response are stored. |
| Citations | `Citation` | Every source the engine returned: URL, domain, title, trust tier, whether it is the business's own property, and the character span of the answer it supports when the engine provides one (Gemini `groundingSupports`, OpenAI `url_citation` indices, Anthropic citation blocks, Perplexity `[n]` markers). An answer with no sources is stored with `noCitations = true`. |
| Mention analysis | `EngineRun` | Deterministic name matching with spans, plus a classifier pass (a search-free completion) for sentiment, accuracy against the business's own facts, and the ordered list of businesses the answer names. A name that appears only inside "I could not find information about X" is echo, not a mention. |
| Competitors | `CompetitorDetected` | Businesses named instead of, or alongside, the target, aggregated across runs with the run ids as evidence. |
| Site checks | `SiteCheck` | Homepage, `robots.txt`, `llms.txt` and sitemap fetched through an SSRF-safe fetcher: structured data, NAP, hours, FAQ, about page, rendering, HTTPS, response time and per-crawler access. Checks that could not complete are recorded as unknown rather than failed. |

## 2. From evidence to score

1. Every sub-metric produces a value in **0–1** (or `null` when it could not be measured).
2. `points = value × weight`; `pointsLost = weight − points`. A `null` value scores 0 points and lowers confidence instead of pretending to measure.
3. A pillar's score is the sum of its sub-metrics; the overall score is the sum of the pillars (weights total 100).
4. Hard caps are applied (section 5), then the grade band (section 6).
5. Every sub-metric stores a plain-language `finding` and an `evidence` reference (run ids, citation ids, site-check fields or competitor ids) in `ScoreBreakdown`, so every point lost is traceable to a specific record.

### Engines with evidence

Visibility is measured over the engines that contributed evidence: every engine whose `ScanEngine` status is `live`, plus any engine that completed at least one answer. An engine tripped by a fatal provider error (quota, billing) after it had already answered keeps status `error`, but its completed answers are real evidence, so it still counts for engine coverage, confidence and the "unmeasured" checks. Visibility is unmeasured only when no answer was collected at all.

### Repeated runs and the median

For each engine × prompt pair the mention values of the repeated runs (0 or 1) are reduced with the **median** (for two runs this is their mean). The mention rate is the mean of those medians across prompts, so a prompt that flips between runs contributes 0.5 rather than whichever run happened to come last.

### Confidence

Confidence is reported per pillar and overall (`high`, `medium`, `low`):

- **Visibility**: `low` if fewer than 4 answers were collected or no engine has evidence, or if more than 50 % of repeated engine × prompt pairs disagree; `medium` if 20–50 % disagree or only one engine has evidence; otherwise `high`.
- **Competitive position**: as visibility, but `low` when competitors were never extracted (no classifier engine ran on any answer and no competitor was detected) and at most `medium` when the classifier ran on only some of the answers.
- **Source authority**: by the number of sources behind answers that mention the business — `high` ≥ 10, `medium` ≥ 4, else `low`.
- **Site-based pillars**: `low` if a website was given but could not be fetched; `medium` if some checks (robots, llms.txt, sitemap) could not complete; otherwise `high`. With no website at all the checks are definitively zero, so confidence is `high`.
- **Fact accuracy**: by sample size — `high` ≥ 6 checked answers, `medium` ≥ 3, else `low`.
- **Overall** = the worst confidence among the four heaviest pillars (visibility, source authority, entity clarity, content answerability).

## 3. Pillars and sub-metrics

Weights are the starting hypothesis from the brief, kept after research review; the research did not support moving weight away from measured visibility, and the on-site pillars are deliberately small because a business can be highly visible with a mediocre site.

### AI Visibility — 30

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| Mention rate | 15 | Mean over prompts of the median mention across repeated runs | evidence-backed |
| Prominence when mentioned | 6 | Mean position score over mentioning answers: 1st = 1, 2nd = 0.75, 3rd = 0.5, 4th–5th = 0.3, later = 0.15, unknown position = 0.5 | evidence-backed |
| Engine coverage | 6 | Engines with evidence that mentioned the business at least once ÷ engines with evidence; `null` when no answer was collected | evidence-backed |
| Direct brand recognition | 3 | Mention rate over the direct-brand prompts only | heuristic |

### Source Authority — 20

Computed over the citations behind answers that mention the business. If the business is never mentioned, nothing supports it and the pillar is 0 with that finding; if it is mentioned but engines gave no sources, the pillar is 0 with the finding "no source provided".

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| Trust tier of supporting sources | 10 | Mean tier score: tier 1 = 0.85, tier 2 = 1.0, tier 3 = 0.6, tier 4 = 0.2 | evidence-backed |
| Your own site is cited | 5 | Mentioning answers with sources that cite the business's own domain ÷ mentioning answers with sources | evidence-backed |
| Independence from low-trust sources | 5 | 1 − (tier-4 citations ÷ all supporting citations) | evidence-backed |

Trust tiers (assigned by domain in [src/lib/scan/sources.ts](../src/lib/scan/sources.ts); unknown domains default to tier 3):

1. The business's own website and subdomains.
2. Government and academic domains, encyclopedias, major news, industry bodies, established maps and business directories (Google Maps/Business, Apple Maps, BBB).
3. Review platforms, general directories and any other third-party site.
4. Forums, social networks, free blog hosts, Q&A sites and complaint sites.

### Entity Clarity — 15

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| Structured business data | 5 | 1 if the homepage JSON-LD carries a business entity type. The test is `isEntityType` in [src/lib/scan/entityTypes.ts](../src/lib/scan/entityTypes.ts) (the full schema.org LocalBusiness/Organization family plus a pattern for custom subtypes), the same predicate the site scan uses to pick the entity node, so this metric and the NAP metric can never disagree | evidence-backed |
| Name, phone and address in structured data | 3 | 1 if the entity node has a name and a telephone or address | evidence-backed |
| Contact details visible | 3 | 1 if a phone, address or email is visible on the homepage | evidence-backed |
| Descriptive title and meta description | 2 | 0.5 each | heuristic |
| Accuracy of what AI says about you | 2 | Mean over checked answers: accurate = 1, unverifiable = 0.7, inaccurate = 0 | evidence-backed |

### Content Answerability — 15

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| Meta description | 2 | present | heuristic |
| Clear main heading | 2 | H1 present | heuristic |
| Enough readable text | 3 | ≥ 500 words = 1, ≥ 250 = 0.6, ≥ 100 = 0.3, else 0 | heuristic |
| Opening hours stated | 3 | present in text or structured data | evidence-backed |
| Question-and-answer content | 2 | FAQ section or FAQPage markup | heuristic |
| About page | 3 | internal About/Team page linked | heuristic |

### Technical AI Readiness — 10

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| AI crawlers allowed | 4 | Allowed ÷ 10 key user-agents (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Googlebot), evaluated with a spec-compliant robots.txt parser | evidence-backed |
| HTTPS | 1 | final URL is https | evidence-backed |
| Readable without JavaScript | 2 | 1 unless the raw HTML carries almost no text | evidence-backed |
| XML sitemap | 1 | found; `null` (unmeasured, low confidence) when the sitemap could not be fetched | heuristic |
| llms.txt | 1 | present and non-HTML; `null` (unmeasured, low confidence) when the file could not be fetched | heuristic |
| Response time | 1 | ≤ 800 ms = 1, ≤ 2 s = 0.5, else 0 | heuristic |

### Competitive Position — 10

| Sub-metric | Weight | Value | Label |
|---|---|---|---|
| Share of voice vs. top competitor | 6 | mentioning answers ÷ (mentioning answers + top competitor's answers) | evidence-backed |
| Rank among businesses AI names | 4 | 1st = 1, 2nd = 0.6, 3rd = 0.3, else 0 | heuristic |

Both are 0 when the business was never mentioned, whatever else the engines named. When the business was mentioned but competitors were never extracted — no classifier engine ran on any answer (see section 9) and no competitor was detected — both are `null` with the finding "competitor extraction was unavailable" rather than a claimed win. The classifier pass is detected per answer from `EngineRun.analysis.classifierUsed` when the scan passes it, otherwise from the sentiment/accuracy fields, which only the classifier sets.

## 4. Evidence-backed vs heuristic

- **Evidence-backed**: the criterion is a direct measurement of engine behaviour (mentions, positions, sources, accuracy) or is supported by engine documentation or a study with a stated method (crawler access, structured data, rendering, hours for local queries, source trust tiers). Sources: [GEO_RESEARCH.md](GEO_RESEARCH.md) §1–§6.
- **Heuristic**: sound practice whose direct effect on AI answers is not demonstrated by the research (titles, headings, word count, FAQ, About page, sitemap, llms.txt, speed, rank weighting, direct-brand prompts). They carry small weights on purpose; llms.txt in particular is scored at one point because no engine has documented reading it.

The customer-facing "How we score" panel shows the same labels next to every sub-metric.

## 5. Hard caps

A cap sets a ceiling on the overall score. Each cap is stored on the report with its evidence.

| Cap | Ceiling | Trigger |
|---|---|---|
| `no_mentions` | 35 | Answers were collected and none mentioned the business. |
| `no_live_engines` | 40 | No answer was collected from any engine (none was live, or every check failed or was skipped), so visibility is unmeasured. |
| `site_unreachable` | 60 | A website was given but could not be fetched. |
| `crawlers_blocked` | 70 | robots.txt blocks OAI-SearchBot, Claude-SearchBot, PerplexityBot and Googlebot. |

## 6. Grade bands

| Score | Grade |
|---|---|
| 85–100 | Dominant |
| 65–84 | Strong |
| 45–64 | Fair |
| 25–44 | Poor |
| 0–24 | Critical |

## 7. Critical failures, roadmap and cost of inaction

- **Critical failures** are generated only from findings with evidence. Each carries the points lost by the sub-metrics it describes (not its whole pillar) and they are ordered by that number:

  | Failure | Trigger | Points lost |
  |---|---|---|
  | `no_live_engines` | no answer collected from any engine | AI Visibility pillar |
  | `invisible` | never mentioned (the "not even by name" clause is added only when a direct-brand prompt completed) | AI Visibility pillar |
  | `mostly_invisible` | mentioned in under 25 % of prompts | AI Visibility pillar |
  | `outranked` | a competitor named more often than the business | Competitive Position pillar |
  | `low_trust_sources` | ≥ 40 % of supporting sources are tier 4 | trust tier + low-trust independence |
  | `no_sources` | every mentioning answer had no source | Source Authority pillar |
  | `inaccurate` | ≥ 25 % of checked answers contain inaccurate claims | fact accuracy |
  | `site_unreachable` / `no_website` | website could not be fetched / none given | every site-derived sub-metric (entity, content and technical checks; not fact accuracy) |
  | `crawlers_blocked` | robots.txt blocks a crawler that fetches pages while answering (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Googlebot). Blocking only the training-only agents (GPTBot, ClaudeBot, Google-Extended) costs crawler-access points but is not a critical failure | AI crawlers allowed |
  | `no_schema` | no business entity type in the homepage JSON-LD | structured data + structured NAP |

- **Roadmap** items are the measured sub-metrics with points lost, ordered by points recoverable, each with an effort estimate and fix steps. A sub-metric that could not be measured (`null`) is not a confirmed problem, so it is left out; its own finding and the critical failures explain why it could not be assessed. The problems and priorities are always shown; the steps are shown to account holders and admins.
- **Cost of inaction** is labelled an estimate. The only measured input is the mention rate; the three assumptions (monthly AI queries, capture rate, average customer value) are displayed with the formula so they can be replaced.

## 8. Test fixtures

[src/lib/scoring/index.test.ts](../src/lib/scoring/index.test.ts) covers a zero-visibility business (capped at 35, "AI engines cannot find you", visibility pillar 0), an average business (mid-range score, no caps, disagreement lowers confidence, every point lost has a finding), a strong business (Dominant, no caps, no critical failures, deterministic) and each cap. It also covers the edge cases behind version 1.1.0: LocalBusiness subtypes such as `SportsActivityLocation` earning the schema points; an engine tripped after answering still being measured; live engines with no answers being unmeasured; per-metric points on critical failures and the training-only crawler exemption; competitor extraction being unavailable; the by-name clause; unfetched sitemap and llms.txt; and unmeasured metrics staying off the roadmap.

## 9. Known limitations

- Position and competitor extraction depend on the classifier; without any search-free engine available, position falls back to list rank and competitors are not extracted.
- Trust tiers are assigned by domain lists; an authoritative site missing from the list scores as tier 3.
- Site checks read the homepage only.
- Cost-of-inaction defaults are placeholders, not market data.

## 10. Version history

- **1.1.0** — Structured-data points use the shared entity-type predicate (all LocalBusiness subtypes). Engines that completed answers count as measured even if tripped afterwards; "unmeasured" now means no answer was collected. Critical failures carry the points of the sub-metrics they describe and `crawlers_blocked` requires an answer-time crawler. Competitive position is `null` instead of a claimed win when competitors were never extracted. Unfetched sitemap and llms.txt checks are unmeasured rather than absent. The "not even by name" clause needs a completed brand prompt. Unmeasured sub-metrics are left off the roadmap. Scores from 1.0.0 are not directly comparable where these cases apply.
- **1.0.0** — Initial model.
