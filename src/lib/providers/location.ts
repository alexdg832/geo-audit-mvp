const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

export interface ApproximateLocation {
  city: string | null;
  region: string | null;
  country: string | null;
}

/** Splits free-text "City, ST" style input into the fields engines accept for search localisation. */
export function parseLocation(location: string | null | undefined): ApproximateLocation | null {
  const trimmed = (location ?? "").trim();
  if (!trimmed) return null;
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) return { city: parts[0], region: null, country: null };
  const city = parts[0];
  const second = parts[1];
  const third = parts[2] ?? null;
  const regionCode = second.toUpperCase();
  if (US_STATES.has(regionCode)) return { city, region: regionCode, country: "US" };
  if (/^(usa|united states|us)$/i.test(second)) return { city, region: null, country: "US" };
  if (third && /^(usa|united states|us)$/i.test(third)) return { city, region: second, country: "US" };
  if (/^(uk|united kingdom|england|scotland|wales)$/i.test(second)) return { city, region: null, country: "GB" };
  if (/^(canada)$/i.test(second) || (third && /^(canada)$/i.test(third))) return { city, region: third ? second : null, country: "CA" };
  if (/^(australia)$/i.test(second) || (third && /^(australia)$/i.test(third))) return { city, region: third ? second : null, country: "AU" };
  return { city, region: second, country: null };
}
