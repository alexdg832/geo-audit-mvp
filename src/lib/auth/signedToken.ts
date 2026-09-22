import { createHmac, timingSafeEqual } from "crypto";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET env var is required to sign session cookies");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Encodes an arbitrary JSON payload plus an expiry into a signed, tamper-proof cookie value. */
export function createSignedToken<T extends object>(
  data: T,
  ttlMs: number = SEVEN_DAYS_MS
): string {
  const payload = base64url(JSON.stringify({ data, exp: Date.now() + ttlMs }));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/** Verifies signature + expiry and returns the decoded payload, or null if invalid/expired. */
export function verifySignedToken<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      data: T;
      exp: number;
    };
    if (Date.now() > decoded.exp) return null;
    return decoded.data;
  } catch {
    return null;
  }
}
