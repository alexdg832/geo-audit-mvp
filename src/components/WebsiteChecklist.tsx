import { WebsiteCheckResult } from "@/lib/audit/types";

function Row({ pass, label }: { pass: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-white ${
          pass ? "bg-green-600" : "bg-stone-400"
        }`}
      >
        {pass ? "✓" : "–"}
      </span>
      <span className={pass ? "text-stone-800" : "text-stone-500"}>{label}</span>
    </li>
  );
}

export function WebsiteChecklist({ checks }: { checks: WebsiteCheckResult }) {
  if (!checks.urlProvided) {
    return <p className="text-sm text-stone-500">No website was provided, so this category scored 0.</p>;
  }
  if (!checks.fetchOk) {
    return (
      <p className="text-sm text-stone-500">
        We couldn&apos;t reach {checks.url}
        {checks.fetchError ? ` (${checks.fetchError})` : ""}.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Row pass={checks.https} label="HTTPS enabled" />
      <Row pass={Boolean(checks.title && checks.metaDescription)} label="Title & meta description" />
      <Row pass={checks.hasSchemaOrg} label="Schema.org markup (Organization/LocalBusiness)" />
      <Row pass={checks.hasAboutPage && checks.hasVisibleContactInfo} label="About page & visible contact info" />
      <Row
        pass={checks.robots.gptBotAllowed && checks.robots.claudeBotAllowed && checks.robots.perplexityBotAllowed}
        label="robots.txt allows AI crawlers"
      />
      <Row pass={checks.hasLlmsTxt} label="llms.txt present" />
    </ul>
  );
}
