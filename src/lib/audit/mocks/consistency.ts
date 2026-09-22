import { SeededRandom } from "../seed";
import { ConsistencyResult } from "../types";

/**
 * TODO(real integration): replace with a real NAP (name/address/phone)
 * consistency check across the mentions gathered, likely via an LLM
 * comparing extracted facts against the Truth Brief.
 */

const POSSIBLE_ISSUES = [
  "Phone number differs between the Google Business Profile and BBB listings.",
  "Suite number is missing from one of the directory listings.",
  "Business name is abbreviated inconsistently across directories.",
  "One directory lists a previous address.",
  "Hours of operation don't match between two listings.",
];

export function generateMockConsistency(businessName: string, location: string | null): ConsistencyResult {
  const rng = new SeededRandom(`consistency:${businessName}:${location ?? ""}`);
  const consistencyRatio = rng.float(0.55, 0.97);
  const issueCount = consistencyRatio > 0.85 ? 0 : rng.int(1, 3);
  const issues = rng.pickMany(POSSIBLE_ISSUES, issueCount);
  return { consistencyRatio, issues };
}
