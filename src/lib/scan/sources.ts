import { domainOf } from "./fetcher";

export type TrustTier = 1 | 2 | 3 | 4;

export interface TierResult {
  tier: TrustTier;
  reason: string;
  isBusinessOwned: boolean;
}

export const TIER_META: Record<TrustTier, { label: string; short: string; description: string }> = {
  1: {
    label: "Tier 1 — Own property",
    short: "Own",
    description: "The business's own website and pages it controls.",
  },
  2: {
    label: "Tier 2 — Authoritative",
    short: "Authoritative",
    description: "Government, major news, encyclopedias, industry bodies and established maps/directories.",
  },
  3: {
    label: "Tier 3 — Reviews & directories",
    short: "Reviews",
    description: "Review platforms, general directories and other third-party sites.",
  },
  4: {
    label: "Tier 4 — User-generated / low trust",
    short: "Low trust",
    description: "Forums, social media, free blog hosts and complaint sites.",
  },
};

const TIER2_DOMAINS = [
  "wikipedia.org",
  "wikidata.org",
  "britannica.com",
  "bbb.org",
  // The bare apex is handled by GOOGLE_APEX_AUTHORITATIVE_PATHS below: only Maps and
  // Search results are authoritative, not every *.google.com host.
  "maps.google.com",
  "business.google.com",
  "g.co",
  "maps.apple.com",
  "bing.com",
  "uschamber.com",
  "sba.gov",
  "nytimes.com",
  "wsj.com",
  "washingtonpost.com",
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "cnn.com",
  "nbcnews.com",
  "cbsnews.com",
  "abcnews.go.com",
  "npr.org",
  "usatoday.com",
  "latimes.com",
  "chicagotribune.com",
  "bostonglobe.com",
  "sfchronicle.com",
  "seattletimes.com",
  "dallasnews.com",
  "houstonchronicle.com",
  "ajc.com",
  "miamiherald.com",
  "denverpost.com",
  "oregonlive.com",
  "startribune.com",
  "philly.com",
  "inquirer.com",
  "theguardian.com",
  "ft.com",
  "economist.com",
  "bloomberg.com",
  "forbes.com",
  "cnbc.com",
  "businessinsider.com",
  "fortune.com",
  "axios.com",
  "techcrunch.com",
  "wired.com",
  "theverge.com",
  "consumerreports.org",
  "ada.org",
  "aap.org",
  "ama-assn.org",
  "aia.org",
  "nar.realtor",
  "americanbar.org",
  "acs.org",
  "ieee.org",
  "nahb.org",
  "nrca.net",
  "phccweb.org",
  "ase.com",
  "asha.org",
  "apa.org",
  "aafp.org",
  "sae.org",
];

const TIER3_DOMAINS = [
  "yelp.com",
  "tripadvisor.com",
  "trustpilot.com",
  "healthgrades.com",
  "zocdoc.com",
  "vitals.com",
  "ratemds.com",
  "webmd.com",
  "caredash.com",
  "avvo.com",
  "findlaw.com",
  "justia.com",
  "martindale.com",
  "lawyers.com",
  "superlawyers.com",
  "angi.com",
  "angieslist.com",
  "homeadvisor.com",
  "thumbtack.com",
  "houzz.com",
  "porch.com",
  "bark.com",
  "yellowpages.com",
  "yp.com",
  "superpages.com",
  "manta.com",
  "mapquest.com",
  "foursquare.com",
  "citysearch.com",
  "local.com",
  "chamberofcommerce.com",
  "dnb.com",
  "opencorporates.com",
  "bizapedia.com",
  "zoominfo.com",
  "crunchbase.com",
  "glassdoor.com",
  "indeed.com",
  "linkedin.com",
  "g2.com",
  "capterra.com",
  "trustradius.com",
  "clutch.co",
  "goodfirms.co",
  "expertise.com",
  "threebestrated.com",
  "opentable.com",
  "resy.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "booking.com",
  "expedia.com",
  "hotels.com",
  "airbnb.com",
  "zillow.com",
  "realtor.com",
  "redfin.com",
  "apartments.com",
  "cars.com",
  "carfax.com",
  "edmunds.com",
  "dealerrater.com",
  "psychologytoday.com",
  "niche.com",
  "greatschools.org",
  "care.com",
  "rover.com",
  "wedding-spot.com",
  "theknot.com",
  "weddingwire.com",
  "eventective.com",
  "classpass.com",
  "mindbodyonline.com",
  "groupon.com",
  "nextdoor.com",
  "alignable.com",
  "hotfrog.com",
  "cylex.us.com",
  "brownbook.net",
  "ezlocal.com",
  "merchantcircle.com",
  "elocal.com",
  "birdeye.com",
  "patch.com",
];

const TIER4_DOMAINS = [
  "reddit.com",
  "quora.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "pinterest.com",
  "tumblr.com",
  "medium.com",
  "substack.com",
  "blogspot.com",
  "wordpress.com",
  "wixsite.com",
  "weebly.com",
  "godaddysites.com",
  "sites.google.com",
  "docs.google.com",
  "drive.google.com",
  "groups.google.com",
  "stackexchange.com",
  "stackoverflow.com",
  "discord.com",
  "telegram.org",
  "t.me",
  "snapchat.com",
  "threads.net",
  "bsky.app",
  "mastodon.social",
  "ripoffreport.com",
  "complaintsboard.com",
  "pissedconsumer.com",
  "sitejabber.com",
  "scamadviser.com",
  "trustedreviews.com",
  "yahoo.com",
  "answers.com",
  "city-data.com",
  "topix.com",
];

/** On the google.com apex (www. stripped) only these paths carry authoritative listings. */
const GOOGLE_APEX_AUTHORITATIVE_PATHS = /^\/(maps|search|local)(?:\/|$|\?)/;

/**
 * Platforms a small business commonly gives as its "website" or redirects to, on top of
 * the tier lists. None of these can be a business's own domain.
 */
const EXTRA_PLATFORM_DOMAINS = ["google.com", "business.site", "linktr.ee", "linktree.com", "bio.link", "beacons.ai", "about.me", "carrd.co", "square.site", "myshopify.com"];

/**
 * Hosts that give every customer their own subdomain (mybiz.wixsite.com): that subdomain
 * is genuinely the business's site, while the bare host is the platform.
 */
const USER_SUBDOMAIN_HOSTS = new Set([
  "wixsite.com", "weebly.com", "wordpress.com", "blogspot.com", "godaddysites.com", "tumblr.com", "substack.com",
  "business.site", "carrd.co", "square.site", "myshopify.com",
]);

function matchesDomain(domain: string, candidate: string): boolean {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

function inList(domain: string, list: string[]): string | null {
  return list.find((d) => matchesDomain(domain, d)) ?? null;
}

/**
 * True when a domain is a shared third-party platform (social network, directory, review
 * site, free-host root, Google) rather than a domain one business owns. Used so a site that
 * redirects to facebook.com, or an owner who types their Facebook page as the website, never
 * makes that platform the "own site" for citation scoring.
 */
export function isKnownPlatformDomain(domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (!d) return false;
  for (const list of [TIER2_DOMAINS, TIER3_DOMAINS, TIER4_DOMAINS, EXTRA_PLATFORM_DOMAINS]) {
    for (const entry of list) {
      if (d === entry) return true;
      if (d.endsWith(`.${entry}`) && !USER_SUBDOMAIN_HOSTS.has(entry)) return true;
    }
  }
  return false;
}

const GOV_EDU = /(\.|^)(gov|edu|mil)$|\.gov\.[a-z]{2}$|\.gc\.ca$|\.edu\.[a-z]{2}$|\.ac\.[a-z]{2}$/;

/**
 * Assigns a trust tier to a cited URL. Unknown domains default to Tier 3
 * ("general third-party site") rather than being trusted or condemned blindly.
 */
export function classifySource(url: string, businessDomain: string | null): TierResult {
  const domain = domainOf(url);
  if (!domain) return { tier: 3, reason: "Unparseable URL", isBusinessOwned: false };

  if (businessDomain && matchesDomain(domain, businessDomain)) {
    return { tier: 1, reason: "The business's own website", isBusinessOwned: true };
  }

  const t4 = inList(domain, TIER4_DOMAINS);
  if (t4) return { tier: 4, reason: `User-generated or low-trust platform (${t4})`, isBusinessOwned: false };

  if (GOV_EDU.test(domain)) return { tier: 2, reason: "Government or academic domain", isBusinessOwned: false };

  if (domain === "google.com") {
    // domainOf strips "www.", so www.google.com/maps/... lands here. Anything else on the
    // apex (accounts, support, policies) is an ordinary third-party page.
    const path = new URL(url).pathname;
    if (GOOGLE_APEX_AUTHORITATIVE_PATHS.test(path)) {
      return { tier: 2, reason: `Authoritative third party (google.com${path.match(/^\/[a-z]+/)?.[0] ?? ""})`, isBusinessOwned: false };
    }
    return { tier: 3, reason: "General third-party website", isBusinessOwned: false };
  }

  const t2 = inList(domain, TIER2_DOMAINS);
  if (t2) return { tier: 2, reason: `Authoritative third party (${t2})`, isBusinessOwned: false };

  const t3 = inList(domain, TIER3_DOMAINS);
  if (t3) return { tier: 3, reason: `Review platform or directory (${t3})`, isBusinessOwned: false };

  if (/\/(forum|forums|thread|threads|community|discussion)s?\//i.test(url)) {
    return { tier: 4, reason: "Forum or discussion thread", isBusinessOwned: false };
  }

  return { tier: 3, reason: "General third-party website", isBusinessOwned: false };
}
