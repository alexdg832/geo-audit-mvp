import * as cheerio from "cheerio";
import { domainOf, normalizeWebsiteUrl, safeFetch } from "./fetcher";
import { AI_USER_AGENTS, isAllowed, parseRobots } from "./robots";

export interface SiteScanResult {
  url: string | null;
  fetchOk: boolean;
  fetchError: string | null;
  httpStatus: number | null;
  finalUrl: string | null;
  https: boolean;
  responseMs: number | null;
  htmlBytes: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  wordCount: number | null;
  textRatio: number | null;
  jsRequired: boolean | null;
  metaRobots: string | null;
  schemaTypes: string[];
  schemaHasNap: boolean | null;
  hasAboutPage: boolean | null;
  hasContactInfo: boolean | null;
  detectedPhone: string | null;
  detectedAddress: string | null;
  hasHours: boolean | null;
  hasFaq: boolean | null;
  lastModified: string | null;
  robotsFound: boolean | null;
  robots: Record<string, boolean> | null;
  robotsDedicated: string[];
  llmsTxtFound: boolean | null;
  sitemapFound: boolean | null;
  sitemapUrl: string | null;
  categoryHint: string | null;
  /** Fields that could not be determined (fetch failures), so scoring can lower confidence instead of penalising. */
  unknown: string[];
}

const PHONE_REGEX = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const ADDRESS_REGEX =
  /\b\d{1,6}\s+[A-Za-z0-9.'\s]{2,40}?\s(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Way|Court|Ct|Place|Pl|Parkway|Pkwy|Highway|Hwy|Suite|Ste)\b\.?(?:[,\s]+(?:Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?/i;
const HOURS_REGEX = /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:[-–—]|to|through)?\s*(?:[a-z]+\.?\s*)?[:\s]*\d{1,2}(?::\d{2})?\s*(?:am|pm)/i;

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness", "AnimalShelter", "ArchiveOrganization", "AutomotiveBusiness", "AutoBodyShop", "AutoDealer",
  "AutoPartsStore", "AutoRental", "AutoRepair", "AutoWash", "GasStation", "MotorcycleDealer", "MotorcycleRepair",
  "ChildCare", "Dentist", "DryCleaningOrLaundry", "EmergencyService", "FireStation", "Hospital", "PoliceStation",
  "EmploymentAgency", "EntertainmentBusiness", "AdultEntertainment", "AmusementPark", "ArtGallery", "Casino",
  "ComedyClub", "MovieTheater", "NightClub", "FinancialService", "AccountingService", "AutomatedTeller",
  "BankOrCreditUnion", "InsuranceAgency", "FoodEstablishment", "Bakery", "BarOrPub", "Brewery", "CafeOrCoffeeShop",
  "Distillery", "FastFoodRestaurant", "IceCreamShop", "Restaurant", "Winery", "GovernmentOffice", "PostOffice",
  "HealthAndBeautyBusiness", "BeautySalon", "DaySpa", "HairSalon", "HealthClub", "NailSalon", "TattooParlor",
  "HomeAndConstructionBusiness", "Electrician", "GeneralContractor", "HVACBusiness", "HousePainter", "Locksmith",
  "MovingCompany", "Plumber", "RoofingContractor", "InternetCafe", "LegalService", "Attorney", "Notary", "Library",
  "LodgingBusiness", "BedAndBreakfast", "Campground", "Hostel", "Hotel", "Motel", "Resort", "VacationRental",
  "MedicalBusiness", "CommunityHealth", "Dermatology", "DietNutrition", "Emergency", "Geriatric", "Gynecologic",
  "MedicalClinic", "Midwifery", "Nursing", "Obstetric", "Oncologic", "Optician", "Optometric", "Otolaryngologic",
  "Pediatric", "Pharmacy", "Physician", "Physiotherapy", "PlasticSurgery", "Podiatric", "PrimaryCare", "Psychiatric",
  "PublicHealth", "VeterinaryCare", "ProfessionalService", "RadioStation", "RealEstateAgent", "RecyclingCenter",
  "SelfStorage", "ShoppingCenter", "SportsActivityLocation", "BowlingAlley", "ExerciseGym", "GolfCourse",
  "PublicSwimmingPool", "SkiResort", "SportsClub", "StadiumOrArena", "TennisComplex", "Store", "BikeStore",
  "BookStore", "ClothingStore", "ComputerStore", "ConvenienceStore", "DepartmentStore", "ElectronicsStore", "Florist",
  "FurnitureStore", "GardenStore", "GroceryStore", "HardwareStore", "HobbyShop", "HomeGoodsStore", "JewelryStore",
  "LiquorStore", "MensClothingStore", "MobilePhoneStore", "MovieRentalStore", "MusicStore", "OfficeEquipmentStore",
  "OutletStore", "PawnShop", "PetStore", "ShoeStore", "SportingGoodsStore", "TireShop", "ToyStore", "WholesaleStore",
  "TelevisionStation", "TouristInformationCenter", "TravelAgency", "Organization", "Corporation", "MedicalOrganization",
  "EducationalOrganization", "School", "SportsOrganization",
]);

const CATEGORY_OVERRIDES: Record<string, string> = {
  HVACBusiness: "HVAC company",
  CafeOrCoffeeShop: "coffee shop",
  BarOrPub: "bar",
  ExerciseGym: "gym",
  HealthClub: "gym",
  SportsActivityLocation: "sports facility",
  SportsClub: "sports club",
  Attorney: "law firm",
  LegalService: "law firm",
  Physician: "doctor",
  MedicalClinic: "medical clinic",
  MedicalBusiness: "medical practice",
  RealEstateAgent: "real estate agent",
  GeneralContractor: "general contractor",
  HomeAndConstructionBusiness: "home services company",
  ProfessionalService: "professional service",
  LodgingBusiness: "hotel",
  FoodEstablishment: "restaurant",
  FastFoodRestaurant: "fast food restaurant",
  HealthAndBeautyBusiness: "beauty business",
  AutomotiveBusiness: "auto shop",
  AutoRepair: "auto repair shop",
  FinancialService: "financial services firm",
  AccountingService: "accounting firm",
  InsuranceAgency: "insurance agency",
  EntertainmentBusiness: "entertainment venue",
  ChildCare: "child care center",
  DryCleaningOrLaundry: "dry cleaner",
  VeterinaryCare: "veterinarian",
  MovingCompany: "moving company",
  RoofingContractor: "roofing contractor",
  HousePainter: "painting contractor",
  SelfStorage: "self storage facility",
  EducationalOrganization: "school",
  School: "school",
  Store: "store",
};

const GENERIC_TYPES = new Set(["LocalBusiness", "Organization", "Corporation", "Thing", "WebSite", "WebPage"]);

function categoryFromType(type: string): string | null {
  if (GENERIC_TYPES.has(type)) return null;
  if (CATEGORY_OVERRIDES[type]) return CATEGORY_OVERRIDES[type];
  return type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj["@type"]) out.push(obj);
    for (const [key, value] of Object.entries(obj)) {
      if (key === "@context") continue;
      if (value && typeof value === "object") collectNodes(value, out);
    }
  }
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.replace(/^https?:\/\/schema\.org\//, "")];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((x) => x.replace(/^https?:\/\/schema\.org\//, ""));
  return [];
}

function stringField(node: Record<string, unknown>, key: string): string | null {
  const v = node[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function addressText(node: Record<string, unknown>): string | null {
  const addr = node.address;
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    const parts = ["streetAddress", "addressLocality", "addressRegion", "postalCode"].map((k) => stringField(a, k)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function emptyResult(url: string | null): SiteScanResult {
  return {
    url,
    fetchOk: false,
    fetchError: null,
    httpStatus: null,
    finalUrl: null,
    https: false,
    responseMs: null,
    htmlBytes: null,
    title: null,
    metaDescription: null,
    h1: null,
    wordCount: null,
    textRatio: null,
    jsRequired: null,
    metaRobots: null,
    schemaTypes: [],
    schemaHasNap: null,
    hasAboutPage: null,
    hasContactInfo: null,
    detectedPhone: null,
    detectedAddress: null,
    hasHours: null,
    hasFaq: null,
    lastModified: null,
    robotsFound: null,
    robots: null,
    robotsDedicated: [],
    llmsTxtFound: null,
    sitemapFound: null,
    sitemapUrl: null,
    categoryHint: null,
    unknown: [],
  };
}

/** Fetches the homepage, robots.txt, llms.txt and sitemap and evaluates AI-readiness signals. */
export async function scanSite(websiteInput: string | null): Promise<SiteScanResult> {
  if (!websiteInput) return emptyResult(null);
  const url = normalizeWebsiteUrl(websiteInput);
  if (!url) return { ...emptyResult(websiteInput), fetchError: "Could not parse the website address." };

  const result = emptyResult(url);
  let page = await safeFetch(url);
  if (!page.ok && !page.status && url.startsWith("https://") && !/^https?:\/\//i.test(websiteInput.trim())) {
    const httpUrl = `http://${url.slice("https://".length)}`;
    const retry = await safeFetch(httpUrl);
    if (retry.ok) page = retry;
  }

  result.httpStatus = page.status;
  result.finalUrl = page.finalUrl;
  result.responseMs = page.ttfbMs;
  result.https = page.finalUrl.startsWith("https://");

  if (!page.ok) {
    result.fetchError = page.error ?? `HTTP ${page.status}`;
    result.unknown.push("homepage");
    return result;
  }
  result.fetchOk = true;
  result.htmlBytes = page.bytes;

  const $ = cheerio.load(page.body);
  result.title = $("title").first().text().trim() || null;
  result.metaDescription = $('meta[name="description"]').attr("content")?.trim() || null;
  result.h1 = $("h1").first().text().replace(/\s+/g, " ").trim() || null;
  result.metaRobots = $('meta[name="robots"]').attr("content")?.trim() || page.headers["x-robots-tag"] || null;
  result.lastModified =
    $('meta[property="article:modified_time"]').attr("content") ||
    $('meta[name="last-modified"]').attr("content") ||
    page.headers["last-modified"] ||
    null;

  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectNodes(JSON.parse($(el).contents().text()), nodes);
    } catch {
      // malformed JSON-LD is ignored
    }
  });
  const schemaTypes = Array.from(new Set(nodes.flatMap(typesOf)));
  result.schemaTypes = schemaTypes;
  const entityNodes = nodes.filter((n) => typesOf(n).some((t) => LOCAL_BUSINESS_TYPES.has(t) || /Business|Store|Shop|Service|Restaurant|Clinic|Salon|Agency|Contractor|Hotel|School|Studio|Dojo/.test(t)));
  const primary = entityNodes[0] ?? null;
  const schemaPhone = primary ? stringField(primary, "telephone") : null;
  const schemaAddress = primary ? addressText(primary) : null;
  result.schemaHasNap = Boolean(primary && stringField(primary, "name") && (schemaPhone || schemaAddress));
  const schemaHours = Boolean(primary && (primary.openingHours || primary.openingHoursSpecification));
  result.hasFaq = schemaTypes.includes("FAQPage") || /frequently asked questions|\bFAQs?\b/i.test($("h1,h2,h3").text());
  if (nodes.some((n) => typesOf(n).some((t) => t === "Person" || t === "Article")) && primary && stringField(primary, "dateModified")) {
    result.lastModified = result.lastModified ?? stringField(primary, "dateModified");
  }
  for (const t of schemaTypes) {
    const c = categoryFromType(t);
    if (c && (LOCAL_BUSINESS_TYPES.has(t) || /Business|Store|Shop|Service|Restaurant|Clinic|Salon|Agency|Contractor|Hotel|School|Studio|Dojo/.test(t))) {
      result.categoryHint = c;
      break;
    }
  }

  $("script, style, noscript, template, svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  result.wordCount = words;
  result.textRatio = page.bytes > 0 ? Number((Buffer.byteLength(text, "utf8") / page.bytes).toFixed(3)) : null;
  result.jsRequired = words < 60 && page.bytes > 20_000;

  const telHref = $('a[href^="tel:"]').first().attr("href");
  const phoneFromText = text.match(PHONE_REGEX)?.[0] ?? null;
  result.detectedPhone = schemaPhone ?? (telHref ? telHref.replace(/^tel:/i, "").trim() : null) ?? phoneFromText;
  result.detectedAddress = schemaAddress ?? text.match(ADDRESS_REGEX)?.[0] ?? null;
  result.hasContactInfo = Boolean(result.detectedPhone || result.detectedAddress || $('a[href^="mailto:"]').length);
  result.hasHours = schemaHours || HOURS_REGEX.test(text);

  const origin = new URL(page.finalUrl).origin;
  const siteDomain = domainOf(page.finalUrl);
  result.hasAboutPage = $("a[href]").toArray().some((el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const u = new URL(href, page.finalUrl);
      return domainOf(u.toString()) === siteDomain && /\/(about|about-us|our-story|team|who-we-are)\b/i.test(u.pathname);
    } catch {
      return false;
    }
  });

  const [robotsRes, llmsRes] = await Promise.all([
    safeFetch(`${origin}/robots.txt`, { maxBytes: 256 * 1024, accept: "text/plain,*/*;q=0.5" }),
    safeFetch(`${origin}/llms.txt`, { maxBytes: 256 * 1024, accept: "text/plain,text/markdown,*/*;q=0.5" }),
  ]);

  if (robotsRes.ok && !/<html|<!doctype/i.test(robotsRes.body.slice(0, 200))) {
    const parsed = parseRobots(robotsRes.body);
    result.robotsFound = true;
    result.robots = Object.fromEntries(AI_USER_AGENTS.map(({ agent }) => [agent, isAllowed(parsed, agent, "/")]));
    result.robotsDedicated = AI_USER_AGENTS.filter(({ agent }) =>
      parsed.groups.some((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().startsWith(a)))
    ).map(({ agent }) => agent);
    if (parsed.sitemaps.length) result.sitemapUrl = parsed.sitemaps[0];
  } else if (robotsRes.status === 404 || (robotsRes.ok && /<html|<!doctype/i.test(robotsRes.body.slice(0, 200)))) {
    result.robotsFound = false;
    result.robots = Object.fromEntries(AI_USER_AGENTS.map(({ agent }) => [agent, true]));
  } else {
    result.unknown.push("robots");
  }

  if (llmsRes.ok) {
    const looksHtml = /<html|<!doctype|<head|<body/i.test(llmsRes.body.slice(0, 500));
    const textType = !llmsRes.contentType || /text\/(plain|markdown)|application\/octet-stream/i.test(llmsRes.contentType);
    result.llmsTxtFound = !looksHtml && textType && llmsRes.body.trim().length > 0;
  } else if (llmsRes.status) {
    result.llmsTxtFound = false;
  } else {
    result.unknown.push("llms");
  }

  const sitemapCandidate = result.sitemapUrl ?? `${origin}/sitemap.xml`;
  const sitemapRes = await safeFetch(sitemapCandidate, { maxBytes: 64 * 1024, accept: "application/xml,text/xml,*/*;q=0.5" });
  if (sitemapRes.ok && /<(urlset|sitemapindex)/i.test(sitemapRes.body)) {
    result.sitemapFound = true;
    result.sitemapUrl = sitemapCandidate;
  } else if (sitemapRes.status) {
    result.sitemapFound = false;
    if (!result.sitemapUrl) result.sitemapUrl = null;
  } else {
    result.unknown.push("sitemap");
  }

  return result;
}
