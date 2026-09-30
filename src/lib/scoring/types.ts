import type { PromptKind } from "@/lib/scan/prompts";
import type { SiteScanResult } from "@/lib/scan/siteScan";

export type PillarKey =
  | "ai_visibility"
  | "source_authority"
  | "entity_clarity"
  | "content_answerability"
  | "technical_readiness"
  | "competitive_position";

export type Confidence = "high" | "medium" | "low";
export type EvidenceLabel = "evidence-backed" | "heuristic";
export type TrustTier = 1 | 2 | 3 | 4;

export interface EngineInput {
  id: string;
  label: string;
  status: "live" | "not_configured" | "error" | "skipped";
}

export interface CitationInput {
  id: string;
  tier: TrustTier;
  isBusinessOwned: boolean;
  domain: string;
}

export interface RunInput {
  id: string;
  engine: string;
  promptIndex: number;
  promptKind: PromptKind;
  runIndex: number;
  status: string;
  mentioned: boolean | null;
  mentionPosition: number | null;
  listItemCount: number | null;
  sentiment: string | null;
  accuracy: string | null;
  noCitations: boolean;
  citations: CitationInput[];
  competitorNames: string[];
  /**
   * Whether the classifier pass ran on this answer (EngineRun.analysis.classifierUsed). Optional:
   * when omitted the scoring infers it from sentiment/accuracy, which are set only by the classifier.
   */
  classifierUsed?: boolean | null;
}

export interface CompetitorInput {
  id: string;
  name: string;
  runCount: number;
  mentionCount: number;
}

export interface ScoringInput {
  businessName: string;
  engines: EngineInput[];
  runs: RunInput[];
  site: SiteScanResult | null;
  competitors: CompetitorInput[];
}

export interface EvidenceRefs {
  runIds?: string[];
  citationIds?: string[];
  siteCheckFields?: string[];
  competitorIds?: string[];
  note?: string;
}

export interface MetricResult {
  pillar: PillarKey;
  metric: string;
  title: string;
  label: EvidenceLabel;
  weight: number;
  /** Normalised 0-1; null when the metric could not be measured. */
  value: number | null;
  points: number;
  pointsLost: number;
  confidence: Confidence;
  finding: string;
  evidence: EvidenceRefs;
}

export interface PillarResult {
  key: PillarKey;
  label: string;
  weight: number;
  score: number;
  confidence: Confidence;
  metrics: MetricResult[];
}

export interface CapApplied {
  key: string;
  ceiling: number;
  reason: string;
  evidence: EvidenceRefs;
}

export interface CriticalFailure {
  key: string;
  title: string;
  detail: string;
  pillar: PillarKey;
  pointsLost: number;
  evidence: EvidenceRefs;
}

export interface RoadmapItem {
  priority: number;
  key: string;
  title: string;
  pillar: PillarKey;
  pointsRecoverable: number;
  effort: "low" | "medium" | "high";
  evidence: EvidenceRefs;
  /** Detailed fix steps; shown only after the call-to-action. */
  steps: string[];
}

export interface CostOfInaction {
  label: "estimate";
  assumptions: { key: string; label: string; value: number; note: string }[];
  mentionRate: number;
  missedDiscoveriesPerMonth: number;
  estimatedLostCustomersPerMonth: number;
  estimatedLostRevenuePerMonth: number;
  estimatedLostRevenuePerYear: number;
  formula: string;
}

export interface ScoringOutput {
  version: string;
  score: number;
  uncappedScore: number;
  grade: string;
  confidence: Confidence;
  verdict: string;
  pillars: PillarResult[];
  metrics: MetricResult[];
  caps: CapApplied[];
  criticalFailures: CriticalFailure[];
  roadmap: RoadmapItem[];
  costOfInaction: CostOfInaction;
  stats: {
    /** Engines with evidence: roster status "live", or at least one completed answer. */
    liveEngines: number;
    totalRuns: number;
    completedRuns: number;
    mentionedRuns: number;
    mentionRate: number;
    runsWithCitations: number;
    disagreementRate: number;
  };
}
