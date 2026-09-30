// NEXT_PUBLIC_CALENDLY_URL is a public scheduling link, not a secret, so it is safe to inline in the browser bundle.
const calendlyFromEnv = process.env.NEXT_PUBLIC_CALENDLY_URL?.trim() || "";

export const siteConfig = {
  name: "TrueSource",
  slogan: "Make sure AI tells your story right.",
  description:
    "TrueSource audits how AI assistants like ChatGPT and Claude describe your business, grades the sources they're pulling from, and helps you fix what's wrong.",
  /** Set NEXT_PUBLIC_CALENDLY_URL to replace this placeholder; it also turns on the inline booking embed on the support page. */
  calendlyUrl: calendlyFromEnv || "https://calendly.com/truesource/intro-call",
  calendlyConfigured: Boolean(calendlyFromEnv),
};
