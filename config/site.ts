// NEXT_PUBLIC_CALENDLY_URL is a public scheduling link, not a secret, so it is safe to inline in the browser bundle.
// Because it is inlined, it is read at build time: changing it on Vercel needs a redeploy.
function readCalendlyUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_CALENDLY_URL?.trim();
  if (!raw) return null;
  // Only an https URL is accepted, so a typo or a stray "javascript:" value can never end up in a link or an iframe.
  try {
    return new URL(raw).protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

/** The inline-embed variant of the booking link. The URL API keeps a link that already carries a query string intact. */
function toEmbedUrl(url: string | null): string | null {
  if (!url) return null;
  const embed = new URL(url);
  embed.searchParams.set("hide_gdpr_banner", "1");
  return embed.toString();
}

const calendlyUrl = readCalendlyUrl();

export const siteConfig = {
  name: "TrueSource",
  slogan: "Make sure AI tells your story right.",
  description:
    "TrueSource audits how AI assistants like ChatGPT and Claude describe your business, grades the sources they're pulling from, and helps you fix what's wrong.",
  /**
   * The real Calendly event link, or null when NEXT_PUBLIC_CALENDLY_URL is unset or malformed. There is deliberately no
   * placeholder: every booking surface is hidden until it is set, and clients who ask for a call are told we will email them.
   */
  calendlyUrl,
  calendlyEmbedUrl: toEmbedUrl(calendlyUrl),
  calendlyConfigured: calendlyUrl !== null,
};
