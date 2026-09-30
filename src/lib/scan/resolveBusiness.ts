import { domainOf, normalizeWebsiteUrl } from "./fetcher";
import type { SiteScanResult } from "./siteScan";

export interface ResolvedBusiness {
  name: string;
  website: string | null;
  domain: string | null;
  location: string | null;
  category: string | null;
  categorySource: "schema" | "keywords" | "none";
}

const KEYWORD_CATEGORIES: [RegExp, string][] = [
  [/\b(karate|martial arts|taekwondo|tae kwon do|jiu[- ]?jitsu|bjj|judo|kung fu|mma|dojo|kickboxing|krav maga|kenpo)\b/i, "martial arts school"],
  [/\bortho(dont)/i, "orthodontist"],
  [/\bdent(al|ist|istry)\b/i, "dentist"],
  [/\bplumb/i, "plumber"],
  [/\broof/i, "roofing contractor"],
  [/\b(hvac|heating|air conditioning|ac repair|cooling)\b/i, "HVAC company"],
  [/\belectric(al|ian)s?\b/i, "electrician"],
  [/\b(law|attorney|attorneys|legal|esq)\b/i, "law firm"],
  [/\b(realty|realtor|real estate)\b/i, "real estate agent"],
  [/\b(salon|barber|barbershop)\b/i, "hair salon"],
  [/\bnails?\b/i, "nail salon"],
  [/\b(spa|massage)\b/i, "day spa"],
  [/\b(gym|fitness|crossfit|yoga|pilates)\b/i, "gym"],
  [/\b(pizza|pizzeria)\b/i, "pizza restaurant"],
  [/\b(sushi|ramen|thai|taqueria|tacos|bbq|barbecue|steakhouse|grill|bistro|diner|eatery|tavern|kitchen|restaurant|cantina|trattoria)\b/i, "restaurant"],
  [/\b(coffee|espresso|roasters|cafe|café)\b/i, "coffee shop"],
  [/\b(bakery|bakeshop|cakes|patisserie)\b/i, "bakery"],
  [/\bbrew(ery|ing)\b/i, "brewery"],
  [/\b(auto|automotive|tire|tires|collision|body shop|mechanic|car repair)\b/i, "auto repair shop"],
  [/\b(dealer|dealership|motors)\b/i, "car dealership"],
  [/\b(vet|veterinary|veterinarian|animal hospital|pet clinic)\b/i, "veterinarian"],
  [/\bpediatric/i, "pediatrician"],
  [/\bchiro/i, "chiropractor"],
  [/\b(physical therapy|physio)/i, "physical therapist"],
  [/\bderma/i, "dermatologist"],
  [/\b(optom|eye care|vision center|optical)\b/i, "optometrist"],
  [/\b(clinic|medical|urgent care|family practice|physicians?)\b/i, "medical clinic"],
  [/\bpharmacy\b/i, "pharmacy"],
  [/\binsurance\b/i, "insurance agency"],
  [/\b(accounting|accountants?|cpa|tax|bookkeeping)\b/i, "accounting firm"],
  [/\bphotograph/i, "photographer"],
  [/\b(florist|flowers?)\b/i, "florist"],
  [/\b(hotel|inn|resort|lodge|motel|suites)\b/i, "hotel"],
  [/\b(daycare|day care|preschool|childcare|child care|montessori)\b/i, "child care center"],
  [/\b(tutor|tutoring|learning center)\b/i, "tutoring service"],
  [/\b(academy|school)\b/i, "school"],
  [/\b(moving|movers)\b/i, "moving company"],
  [/\bstorage\b/i, "self storage facility"],
  [/\b(pest|exterminat)/i, "pest control company"],
  [/\blocksmith\b/i, "locksmith"],
  [/\bpaint(ing|ers)\b/i, "painting contractor"],
  [/\b(construction|builders?|contractors?|remodel|remodeling|renovation)\b/i, "general contractor"],
  [/\b(landscap|lawn|tree service|garden)/i, "landscaping company"],
  [/\b(cleaning|cleaners|maid|janitorial)\b/i, "cleaning service"],
  [/\b(window|doors?|garage door|siding|gutters?|fence|fencing|flooring|carpet|tile|cabinets?)\b/i, "home improvement contractor"],
  [/\bsolar\b/i, "solar installer"],
  [/\b(marketing|advertising|seo|media|design studio)\b/i, "marketing agency"],
  [/\b(software|tech|labs?|systems|solutions|consulting)\b/i, "consulting firm"],
  [/\b(bank|credit union)\b/i, "bank"],
  [/\b(church|ministry|parish)\b/i, "church"],
  [/\b(boutique|apparel|clothing)\b/i, "clothing store"],
  [/\bjewel/i, "jewelry store"],
  [/\bfurniture\b/i, "furniture store"],
  [/\bhardware\b/i, "hardware store"],
  [/\b(grocery|market|foods)\b/i, "grocery store"],
  [/\b(liquor|wine|spirits)\b/i, "liquor store"],
  [/\b(pets?|pet store|pet supply)\b/i, "pet store"],
  [/\b(books?|bookstore)\b/i, "bookstore"],
  [/\bdance\b/i, "dance studio"],
  [/\b(music|guitar|piano)\b/i, "music school"],
  [/\b(wedding|venue|events?)\b/i, "event venue"],
  [/\b(catering|caterer)\b/i, "caterer"],
  [/\b(dry clean|laundr)/i, "dry cleaner"],
  [/\btattoo\b/i, "tattoo studio"],
  [/\bfuneral\b/i, "funeral home"],
  [/\b(staffing|recruit)/i, "staffing agency"],
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

/** Resolves the audited business's canonical facts from the form input and the site scan. */
export function resolveBusiness(
  input: { name: string; website: string | null; location: string | null },
  site: SiteScanResult | null
): ResolvedBusiness {
  const name = input.name.replace(/\s+/g, " ").trim();
  const website = input.website ? normalizeWebsiteUrl(input.website) : null;
  const finalUrl = site?.finalUrl ?? website;
  const domain = finalUrl ? domainOf(finalUrl) || null : null;

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
    const fromSite = inferCategoryFromText(site?.title, site?.h1, site?.metaDescription);
    if (fromSite) {
      category = fromSite;
      categorySource = "keywords";
    }
  }

  return {
    name,
    website,
    domain,
    location: normalizeLocation(input.location),
    category,
    categorySource,
  };
}
