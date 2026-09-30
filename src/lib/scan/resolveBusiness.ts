import { domainOf, normalizeWebsiteUrl } from "./fetcher";
import type { SiteScanResult } from "./siteScan";
import { isKnownPlatformDomain } from "./sources";

export interface ResolvedBusiness {
  name: string;
  website: string | null;
  /** The domain the business owns; null when there is no website or it is a shared platform. */
  domain: string | null;
  /** Set when the website redirected to a different site (facebook.com, linktr.ee, …). */
  redirectDomain: string | null;
  location: string | null;
  category: string | null;
  categorySource: "schema" | "keywords" | "none";
}

// Ordered most-specific first: a name is matched against every row in turn and the first
// hit wins, so compound terms ("auto insurance", "kitchen & bath") sit above the bare words
// they contain, and prefixes are anchored so "Rooftop" is not a roofer.
const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/\b(karate|martial arts|taekwondo|tae kwon do|jiu[- ]?jitsu|bjj|judo|kung fu|mma|dojo|kickboxing|krav maga|kenpo)\b/i, "martial arts school"],
  [/\borthodont/i, "orthodontist"],
  [/\bdent(al|ist|istry)\b/i, "dentist"],
  [/\bplumb(ing|ers?)\b/i, "plumber"],
  [/\broof(ing|ers?|s)?\b/i, "roofing contractor"],
  [/\b(hvac|heating|air conditioning|ac repair|cooling)\b/i, "HVAC company"],
  [/\belectric(al|ian)s?\b/i, "electrician"],
  [/\b(law|attorney|attorneys|legal|esq)\b/i, "law firm"],
  [/\b(realty|realtor|real estate)\b/i, "real estate agent"],
  [/\b(salon|barber|barbershop)\b/i, "hair salon"],
  [/\bnails?\b/i, "nail salon"],
  [/\b(spa|massage)\b/i, "day spa"],
  [/\b(gym|fitness|crossfit|yoga|pilates)\b/i, "gym"],
  [/\b(auto repair|auto body|auto service|auto care|car repair|collision|body shop|mechanics?|tires?|smog|oil change|brakes?|transmissions?)\b/i, "auto repair shop"],
  [/\b(dealer|dealership|motors|auto sales|car sales|used cars|pre-?owned|automotive group)\b/i, "car dealership"],
  [/\binsurance\b/i, "insurance agency"],
  [/\b(auto|automotive)\b/i, "auto repair shop"],
  [/\b(kitchens? (?:&|and) baths?|kitchen remodel\w*|bath(?:room)? remodel\w*|remodel(?:ing|ers?|s)?|renovations?|cabinets?|countertops?)\b/i, "remodeling contractor"],
  [/\b(pizza|pizzeria)\b/i, "pizza restaurant"],
  [/\b(sushi|ramen|thai|taqueria|tacos|bbq|barbecue|steakhouse|grille?|bistro|diner|eatery|tavern|pub|kitchen|restaurant|cantina|trattoria)\b/i, "restaurant"],
  [/\b(coffee|espresso|roasters|cafe|café)\b/i, "coffee shop"],
  [/\b(bakery|bakeshop|cakes|patisserie)\b/i, "bakery"],
  [/\bbrew(ery|ing)\b/i, "brewery"],
  [/\b(vet|veterinary|veterinarian|animal hospital|pet clinic)\b/i, "veterinarian"],
  [/\bpediatric/i, "pediatrician"],
  [/\bchiro(practic|practors?)?\b/i, "chiropractor"],
  [/\b(physical therapy|physio\w*)\b/i, "physical therapist"],
  [/\bderma(tolog\w*)?\b/i, "dermatologist"],
  [/\b(optom\w*|eye care|vision center|optical)\b/i, "optometrist"],
  [/\b(clinic|medical|urgent care|family practice|physicians?)\b/i, "medical clinic"],
  [/\bpharmacy\b/i, "pharmacy"],
  [/\b(accounting|accountants?|cpa|tax|bookkeeping)\b/i, "accounting firm"],
  [/\bphotograph(y|ers?|ic|s)?\b/i, "photographer"],
  [/\b(florist|flowers?)\b/i, "florist"],
  [/\b(hotels?|inn|resorts?|motel|suites|bed (?:&|and) breakfast)\b/i, "hotel"],
  [/\b(daycare|day care|preschool|childcare|child care|montessori)\b/i, "child care center"],
  [/\b(tutor|tutoring|learning center)\b/i, "tutoring service"],
  [/\bdance\b/i, "dance studio"],
  [/\b(music|guitar|piano)\b/i, "music school"],
  [/\b(academy|school)\b/i, "school"],
  [/\b(moving|movers)\b/i, "moving company"],
  [/\bstorage\b/i, "self storage facility"],
  [/\b(pest control|pest|exterminat\w*)\b/i, "pest control company"],
  [/\blocksmith\b/i, "locksmith"],
  [/\bpaint(ing|ers)\b/i, "painting contractor"],
  [/\b(construction|builders?|contractors?)\b/i, "general contractor"],
  [/\b(landscap(?:e|es|ing|ers?)|lawn|tree (?:service|care|trimming|removal)|garden(?:ing| center| centre| design))\b/i, "landscaping company"],
  [/\b(dry clean\w*|laundr\w*)\b/i, "dry cleaner"],
  [/\b(cleaning|cleaners|maid|janitorial)\b/i, "cleaning service"],
  [/\b(window|doors?|garage door|siding|gutters?|fence|fencing|flooring|carpet|tile)\b/i, "home improvement contractor"],
  [/\bsolar\b/i, "solar installer"],
  [/\b(marketing|advertising|seo|media|design studio)\b/i, "marketing agency"],
  [/\b(software|tech|labs?|systems|solutions|consulting)\b/i, "consulting firm"],
  [/\b(bank|credit union)\b/i, "bank"],
  [/\b(church|ministry|parish)\b/i, "church"],
  [/\b(boutique|apparel|clothing)\b/i, "clothing store"],
  [/\bjewel(ry|ery|ers?|s)?\b/i, "jewelry store"],
  [/\bfurniture\b/i, "furniture store"],
  [/\bhardware\b/i, "hardware store"],
  [/\b(grocery|grocer|supermarket|foods|farmers market|food market)\b/i, "grocery store"],
  [/\b(liquor|wine|spirits)\b/i, "liquor store"],
  [/\b(pets?|pet store|pet supply)\b/i, "pet store"],
  [/\b(books|bookstore|bookshop|book store|book shop)\b/i, "bookstore"],
  [/\b(wedding|venue|events?)\b/i, "event venue"],
  [/\b(catering|caterer)\b/i, "caterer"],
  [/\btattoo\b/i, "tattoo studio"],
  [/\bfuneral\b/i, "funeral home"],
  [/\b(staffing|recruit(?:ing|ers?|ment))\b/i, "staffing agency"],
  [/\bsecurity\b/i, "security company"],
];

export function inferCategoryFromText(...texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const [pattern, category] of KEYWORD_CATEGORIES) {
      if (pattern.test(text)) return category;
    }
  }
  return null;
}

export function normalizeLocation(location: string | null | undefined): string | null {
  const trimmed = (location ?? "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  return trimmed || null;
}

/** Same site when one host is the other or a subdomain of it (mybiz.com ↔ shop.mybiz.com). */
function isSameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Decides which domain counts as the business's own. It is the domain the owner typed:
 * a redirect that leaves that site (to Facebook, Linktree, a Google page, or any other
 * domain) is recorded but never adopted, because every citation of the target would then
 * score as Tier 1 "own site" and the mention regex would match the platform's name. A
 * typed address that is itself a shared platform yields no owned domain at all.
 */
export function resolveOwnDomain(
  inputDomain: string | null,
  finalDomain: string | null
): { domain: string | null; redirectDomain: string | null } {
  let domain = inputDomain;
  let redirectDomain: string | null = null;
  if (inputDomain && finalDomain && finalDomain !== inputDomain) {
    if (isSameSite(inputDomain, finalDomain)) {
      // A www/subdomain hop: keep the shorter host so its subdomains still match as own.
      domain = finalDomain.length < inputDomain.length ? finalDomain : inputDomain;
    } else {
      redirectDomain = finalDomain;
    }
  }
  if (domain && isKnownPlatformDomain(domain)) domain = null;
  return { domain, redirectDomain };
}

/** Resolves the audited business's canonical facts from the form input and the site scan. */
export function resolveBusiness(
  input: { name: string; website: string | null; location: string | null },
  site: SiteScanResult | null
): ResolvedBusiness {
  const name = input.name.replace(/\s+/g, " ").trim();
  const website = input.website ? normalizeWebsiteUrl(input.website) : null;
  const inputDomain = website ? domainOf(website) || null : null;
  const finalDomain = site?.finalUrl ? domainOf(site.finalUrl) || null : null;
  const { domain, redirectDomain } = resolveOwnDomain(inputDomain, finalDomain);

  // The owner's own name is usually more specific than a plugin's schema type
  // (a karate school marked up as ExerciseGym should still be asked about as a dojo).
  let category: string | null = null;
  let categorySource: ResolvedBusiness["categorySource"] = "none";
  const fromName = inferCategoryFromText(name);
  if (fromName) {
    category = fromName;
    categorySource = "keywords";
  } else if (site?.categoryHint) {
    category = site.categoryHint;
    categorySource = "schema";
  } else {
    // Title and H1 name the business; the meta description is prose ("book your visit",
    // "pet friendly") whose incidental words mis-categorise too often to be used here.
    const fromSite = inferCategoryFromText(site?.title, site?.h1);
    if (fromSite) {
      category = fromSite;
      categorySource = "keywords";
    }
  }

  return {
    name,
    website,
    domain,
    redirectDomain,
    location: normalizeLocation(input.location),
    category,
    categorySource,
  };
}
