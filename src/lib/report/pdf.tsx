import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PILLARS } from "@/lib/scoring";
import { TIER_META } from "@/lib/scan/sources";
import type { ReportData } from "./load";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#1c1917", lineHeight: 1.4 },
  eyebrow: { fontSize: 9, color: "#4f46e5", textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 4 },
  h2: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 6, color: "#1c1917" },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 2 },
  muted: { color: "#57534e", fontSize: 9 },
  score: { fontSize: 40, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  card: { borderWidth: 1, borderColor: "#e7e5e4", borderRadius: 6, padding: 8, marginBottom: 6 },
  redCard: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 6, padding: 8, marginBottom: 6 },
  amberCard: { borderWidth: 1, borderColor: "#fde68a", backgroundColor: "#fffbeb", borderRadius: 6, padding: 8, marginBottom: 6 },
  table: { marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f5f5f4", paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", color: "#57534e", fontSize: 8, textTransform: "uppercase" },
  cell: { paddingRight: 6 },
  answer: { backgroundColor: "#fafaf9", padding: 6, borderRadius: 4, marginTop: 4, fontSize: 9 },
  badge: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#44403c" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#78716c", flexDirection: "row", justifyContent: "space-between" },
});

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Footer({ data }: { data: ReportData }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        TrueSource GEO audit — {data.audit.businessName} — scoring v{data.audit.scoringVersion ?? ""}
        {data.audit.isMock ? " — MOCK DATA" : ""}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function ReportPdf({ data, unlocked }: { data: ReportData; unlocked: boolean }) {
  const { report, audit } = data;
  const completed = data.runs.filter((r) => r.status === "complete");
  const mentioned = completed.filter((r) => r.mentioned);
  const live = data.engines.filter((e) => e.status === "live");
  const allCitations = data.runs.flatMap((r) => r.citations.map((c) => ({ ...c, mentioned: Boolean(r.mentioned) })));
  const aboutYou = allCitations.filter((c) => c.mentioned);
  const tierCounts = [1, 2, 3, 4].map((t) => ({ tier: t, count: aboutYou.filter((c) => c.tier === t).length }));
  const topDomains = Array.from(
    aboutYou.reduce((m, c) => m.set(c.domain, (m.get(c.domain) ?? 0) + 1), new Map<string, number>()).entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const competitors = [
    { name: audit.businessName, runCount: mentioned.length, self: true },
    ...data.competitors.map((c) => ({ name: c.name, runCount: c.runCount, self: false })),
  ].sort((a, b) => b.runCount - a.runCount);
  const scannedOn = audit.completedAt ? new Date(audit.completedAt).toISOString().slice(0, 10) : "";

  return (
    <Document title={`GEO audit report — ${audit.businessName}`} author="TrueSource">
      <Page size="A4" style={styles.page}>
        {audit.isMock && (
          <View style={styles.amberCard}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>MOCK DATA — produced from labelled fixtures, not real AI engines. Not for customers.</Text>
          </View>
        )}
        <Text style={styles.eyebrow}>{audit.businessName}</Text>
        <Text style={styles.h1}>GEO audit report</Text>
        <Text style={styles.muted}>
          {audit.category ?? "Business"}
          {audit.location ? ` in ${audit.location}` : ""}
          {audit.domain ? ` · ${audit.domain}` : ""}
          {scannedOn ? ` · scanned ${scannedOn}` : ""}
        </Text>

        <View style={[styles.row, { marginTop: 18 }]}>
          <View style={{ width: 150 }}>
            <Text style={styles.score}>{report.score}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>{report.grade}</Text>
            <Text style={styles.muted}>out of 100 · {report.confidence} confidence</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.h3}>Verdict</Text>
            <Text>{report.verdict}</Text>
            <Text style={[styles.muted, { marginTop: 6 }]}>
              Engines live: {live.map((e) => e.label).join(", ") || "none"} · answers collected: {completed.length} · answers naming you: {mentioned.length} · sources traced: {allCitations.length}
            </Text>
            {report.caps.map((c) => (
              <Text key={c.key} style={{ color: "#991b1b", marginTop: 4 }}>
                Score capped at {c.ceiling}: {c.reason}
              </Text>
            ))}
          </View>
        </View>

        <Text style={styles.h2}>Critical failures</Text>
        {report.criticalFailures.length === 0 && <Text>No critical failures.</Text>}
        {report.criticalFailures.map((f, i) => (
          <View key={f.key} style={styles.redCard}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: "#7f1d1d" }}>
              {i + 1}. {f.title} (−{f.pointsLost} pts)
            </Text>
            <Text>{f.detail}</Text>
          </View>
        ))}

        <Text style={styles.h2}>Pillar breakdown</Text>
        {PILLARS.map((p) => {
          const summary = report.pillars.find((x) => x.key === p.key);
          const metrics = data.breakdowns.filter((b) => b.pillar === p.key);
          return (
            <View key={p.key} style={styles.card} wrap={false}>
              <View style={styles.row}>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>{p.label}</Text>
                <Text style={{ fontFamily: "Helvetica-Bold" }}>
                  {summary?.score ?? 0}/{p.weight} · {summary?.confidence ?? "low"} confidence
                </Text>
              </View>
              {metrics.map((m) => (
                <View key={m.id} style={styles.tr}>
                  <Text style={[styles.cell, { width: 150 }]}>
                    {m.metric.replace(/_/g, " ")} <Text style={styles.badge}>[{m.label === "evidence-backed" ? "E" : "H"}]</Text>
                  </Text>
                  <Text style={[styles.cell, { width: 50 }]}>
                    {m.points}/{m.weight}
                  </Text>
                  <Text style={{ flex: 1 }}>{m.finding}</Text>
                </View>
              ))}
            </View>
          );
        })}
        <Text style={styles.muted}>[E] evidence-backed criterion · [H] heuristic criterion</Text>
        <Footer data={data} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h2}>Who AI recommends instead</Text>
        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={[styles.th, { width: 30 }]}>#</Text>
            <Text style={[styles.th, { flex: 1 }]}>Business</Text>
            <Text style={[styles.th, { width: 80 }]}>Answers</Text>
          </View>
          {competitors.slice(0, 12).map((c, i) => (
            <View key={`${c.name}-${i}`} style={styles.tr}>
              <Text style={{ width: 30 }}>{i + 1}</Text>
              <Text style={{ flex: 1, fontFamily: c.self ? "Helvetica-Bold" : "Helvetica" }}>
                {c.name}
                {c.self ? " (you)" : ""}
              </Text>
              <Text style={{ width: 80 }}>{c.runCount}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.h2}>Where AI gets its information about you</Text>
        <Text>
          {aboutYou.length} sources sit behind answers that mention you: {tierCounts.map((t) => `${t.count} ${TIER_META[t.tier as 1 | 2 | 3 | 4].short.toLowerCase()} (tier ${t.tier})`).join(", ")}.
        </Text>
        {aboutYou.length > 0 && tierCounts[3].count / aboutYou.length >= 0.4 && (
          <View style={[styles.redCard, { marginTop: 6 }]}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: "#7f1d1d" }}>Warning: low-trust sources are defining your reputation.</Text>
            <Text>{Math.round((tierCounts[3].count / aboutYou.length) * 100)}% of the sources behind answers about you are forums, social posts or anonymous pages.</Text>
          </View>
        )}
        {topDomains.map(([domain, count]) => (
          <Text key={domain}>
            • {domain} — {count} citation{count === 1 ? "" : "s"}
          </Text>
        ))}

        {report.costOfInaction && (
          <>
            <Text style={styles.h2}>What staying invisible costs (estimate)</Text>
            <Text>
              Missed discoveries: {report.costOfInaction.missedDiscoveriesPerMonth}/month · estimated lost customers: {report.costOfInaction.estimatedLostCustomersPerMonth}/month · estimated lost revenue: {usd(report.costOfInaction.estimatedLostRevenuePerMonth)}/month ({usd(report.costOfInaction.estimatedLostRevenuePerYear)}/year).
            </Text>
            <Text style={styles.muted}>Formula: {report.costOfInaction.formula}. Measured mention rate: {Math.round(report.costOfInaction.mentionRate * 100)}%.</Text>
            {report.costOfInaction.assumptions.map((a) => (
              <Text key={a.key} style={styles.muted}>
                Assumption — {a.label}: {a.key === "captureRate" ? `${Math.round(a.value * 100)}%` : a.key === "avgCustomerValue" ? usd(a.value) : a.value}. {a.note}
              </Text>
            ))}
          </>
        )}

        <Text style={styles.h2}>Prioritised fix roadmap</Text>
        {report.roadmap.map((item) => (
          <View key={item.key} style={styles.card} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {item.priority}. {item.title} (+{item.pointsRecoverable} pts · {item.effort} effort)
            </Text>
            {unlocked ? (
              item.steps.map((s, i) => (
                <Text key={i}>
                  {i + 1}. {s}
                </Text>
              ))
            ) : (
              <Text style={styles.muted}>Detailed steps are provided as part of the engagement.</Text>
            )}
          </View>
        ))}

        <Text style={styles.h2}>How we score</Text>
        <Text>
          We asked {live.length} AI engine{live.length === 1 ? "" : "s"} {data.prompts.length} customer questions, {audit.runsPerPrompt} times each, and traced every cited source and the passage it supports. Sub-metrics are normalised to 0–1, weighted and summed within six pillars ({PILLARS.map((p) => `${p.label} ${p.weight}`).join(", ")}). Medians across repeated runs reduce noise; disagreement lowers confidence. Hard caps: 35 if no engine mentions you, 40 if no engine was live, 60 if your site is unreachable, 70 if all AI search crawlers are blocked. Scoring version {audit.scoringVersion}.
        </Text>
        <Footer data={data} />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h2}>Evidence appendix</Text>
        <Text style={styles.muted}>Every answer collected, with its sources and trust tiers. Passages are quoted verbatim from the engines.</Text>
        {data.runs.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {r.engineLabel}
              {r.model ? ` · ${r.model}` : ""} · run {r.runIndex + 1} · {r.completedAt ? new Date(r.completedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : r.status}
              {r.status === "complete" ? (r.mentioned ? ` · mentioned${r.mentionPosition ? ` #${r.mentionPosition}` : ""}` : " · not mentioned") : ` · ${r.status}`}
              {r.sentiment && r.sentiment !== "not_applicable" ? ` · ${r.sentiment}` : ""}
              {r.accuracy && r.accuracy !== "not_applicable" ? ` · ${r.accuracy}` : ""}
            </Text>
            <Text style={styles.muted}>Prompt: {r.promptText}</Text>
            {r.answerText ? (
              <Text style={styles.answer}>{r.answerText.length > 1500 ? `${r.answerText.slice(0, 1500)}…` : r.answerText}</Text>
            ) : (
              <Text style={styles.answer}>{r.error ? `This check failed: ${r.error}` : "No answer recorded."}</Text>
            )}
            {r.accuracyNotes ? <Text style={{ color: "#7f1d1d" }}>Conflicts with your facts: {r.accuracyNotes}</Text> : null}
            {r.status === "complete" && (r.noCitations ? (
              <Text style={styles.muted}>No source provided by this engine.</Text>
            ) : (
              r.citations.map((c, i) => (
                <Text key={c.id} style={{ fontSize: 8.5 }}>
                  {i + 1}. [Tier {c.tier}
                  {c.isBusinessOwned ? " · yours" : ""}] {c.title ? `${c.title} — ` : ""}
                  {c.url}
                  {c.passageText ? ` — supports: “${c.passageText.length > 160 ? `${c.passageText.slice(0, 160)}…` : c.passageText}”` : ""}
                </Text>
              ))
            ))}
          </View>
        ))}
        <Footer data={data} />
      </Page>
    </Document>
  );
}
