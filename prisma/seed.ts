import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.contentPush.deleteMany(),
    prisma.truthBrief.deleteMany(),
    prisma.contactRequest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.sourceMention.deleteMany(),
    prisma.audit.deleteMany(),
    prisma.business.deleteMany(),
  ]);

  const business = await prisma.business.create({
    data: {
      name: "Riverside Family Dental",
      website: "https://riversidefamilydental.example.com",
      location: "Portland, OR",
    },
  });

  const stepsJson = JSON.stringify([
    { key: "website", label: "Checking your website", status: "done" },
    { key: "mentions", label: "Finding what's said about you", status: "done" },
    { key: "sourceTrust", label: "Grading source trust", status: "done" },
    { key: "aiReadiness", label: "Checking AI readiness", status: "done" },
    { key: "score", label: "Calculating your score", status: "done" },
  ]);

  const websiteChecksJson = JSON.stringify({
    urlProvided: true,
    url: "https://riversidefamilydental.example.com",
    fetchOk: true,
    fetchError: null,
    https: true,
    title: "Riverside Family Dental — Portland Dentist",
    metaDescription: "Family and cosmetic dentistry in Portland, OR. New patients welcome.",
    hasSchemaOrg: false,
    schemaType: null,
    hasAboutPage: true,
    hasVisibleContactInfo: true,
    detectedPhone: "(503) 555-0142",
    detectedAddressHint: "123 Riverside Ave",
    robots: {
      checked: true,
      gptBotAllowed: true,
      claudeBotAllowed: false,
      perplexityBotAllowed: true,
    },
    hasLlmsTxt: false,
  });

  const aiSnippetJson = JSON.stringify([
    {
      text: "Riverside Family Dental is a family and cosmetic dentistry practice based in Portland, OR. ",
      accurate: true,
    },
    {
      text: "A few listings show an old phone number for Riverside Family Dental that's no longer in service. ",
      accurate: false,
    },
    {
      text: "Overall reputation appears generally positive based on available sources.",
      accurate: true,
    },
  ]);

  const recommendationsJson = JSON.stringify([
    "Add Schema.org LocalBusiness markup so AI assistants can read your hours, address, and services directly.",
    "Update your phone number everywhere it appears out of date, including older directory listings.",
    "Allow ClaudeBot to crawl your site so Claude can read your pages directly instead of relying on secondhand mentions.",
  ]);

  const audit = await prisma.audit.create({
    data: {
      businessId: business.id,
      status: "complete",
      score: 68,
      sourceTrustScore: 22,
      consistencyScore: 18,
      aiReadinessScore: 17,
      aiVisibilityScore: 11,
      stepsJson,
      websiteChecksJson,
      aiSnippetJson,
      recommendationsJson,
      completedAt: new Date("2026-09-01T12:00:00Z"),
    },
  });

  await prisma.sourceMention.createMany({
    data: [
      {
        auditId: audit.id,
        name: "Riverside Family Dental — Official Website",
        url: "https://riversidefamilydental.example.com",
        tier: 1,
        snippet: "The business's own site, treated as the primary source of truth.",
        accurate: true,
      },
      {
        auditId: audit.id,
        name: "Google Business Profile",
        url: null,
        tier: 1,
        snippet: "Confirms the business's name, location, and services match public records.",
        accurate: true,
      },
      {
        auditId: audit.id,
        name: "Better Business Bureau (BBB)",
        url: "https://www.bbb.org",
        tier: 1,
        snippet: "Cites the correct hours and contact details.",
        accurate: true,
      },
      {
        auditId: audit.id,
        name: "Yelp",
        url: "https://www.yelp.com",
        tier: 2,
        snippet: "Describes the business accurately, matching its official listing.",
        accurate: true,
      },
      {
        auditId: audit.id,
        name: "Chamber of Commerce Member Directory",
        url: null,
        tier: 2,
        snippet: "Lists an outdated address that no longer matches the business's current location.",
        accurate: false,
      },
      {
        auditId: audit.id,
        name: "Niche Industry Directory Listing",
        url: null,
        tier: 2,
        snippet: "Cites the correct hours and contact details.",
        accurate: true,
      },
      {
        auditId: audit.id,
        name: "Reddit — r/Portland thread",
        url: "https://www.reddit.com",
        tier: 3,
        snippet: "Repeats an old phone number that's no longer in service.",
        accurate: false,
      },
      {
        auditId: audit.id,
        name: "Random forum post",
        url: null,
        tier: 3,
        snippet: "Confuses this business with a similarly named dental office in another city.",
        accurate: false,
      },
    ],
  });

  const passwordPlaintext = "demopassword123";
  const user = await prisma.user.create({
    data: {
      email: "demo@riversidefamilydental.example",
      passwordHash: hashPassword(passwordPlaintext),
      businessId: business.id,
    },
  });

  await prisma.contactRequest.create({
    data: {
      userId: user.id,
      name: "Dana Rivera",
      email: user.email,
      goals: "Get our real Google reviews and press mentions to outrank the outdated forum posts.",
      wantsCall: true,
    },
  });

  await prisma.truthBrief.create({
    data: {
      businessId: business.id,
      description:
        "Riverside Family Dental is a family and cosmetic dentistry practice serving Portland, OR and the surrounding area.",
      services:
        "General dentistry, cosmetic dentistry, teeth whitening, dental implants, emergency dental care",
      location: "123 Riverside Ave, Portland, OR 97201",
      keyFacts: [
        "Open Monday through Saturday, 8am to 6pm.",
        "Current phone number is (503) 555-0198.",
        "In business since 2011, family-owned and operated.",
        "Accepting new patients, most major insurance plans accepted.",
      ].join("\n"),
      approvedSources: [
        "https://riversidefamilydental.example.com",
        "https://www.google.com/maps/place/riverside-family-dental",
        "https://www.bbb.org/us/or/portland/profile/dentist/riverside-family-dental",
      ].join("\n"),
    },
  });

  const [publishedPush, inProgressPush, plannedPush] = await Promise.all([
    prisma.contentPush.create({
      data: {
        businessId: business.id,
        title: "Update Google Business Profile phone number",
        type: "Directory listing",
        targetChannel: "Google Business Profile",
        contentBody: "Correct the listed phone number to (503) 555-0198 and confirm business hours.",
        status: "Published",
      },
    }),
    prisma.contentPush.create({
      data: {
        businessId: business.id,
        title: "Add LocalBusiness schema markup",
        type: "Website FAQ/Schema update",
        targetChannel: "riversidefamilydental.example.com",
        contentBody:
          "Add Schema.org LocalBusiness JSON-LD with name, address, phone, and hours so AI assistants can read it directly.",
        status: "In Progress",
      },
    }),
    prisma.contentPush.create({
      data: {
        businessId: business.id,
        title: "New patient FAQ blog post",
        type: "Blog article",
        targetChannel: "Practice blog",
        contentBody:
          "Draft a short FAQ post covering insurance, new patient forms, and what to expect at a first visit.",
        status: "Planned",
      },
    }),
  ]);

  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        message: `New content push created: "${plannedPush.title}" (Planned).`,
        read: false,
      },
      {
        userId: user.id,
        message: `"${publishedPush.title}" status changed to Published.`,
        read: true,
      },
      {
        userId: user.id,
        message: `"${inProgressPush.title}" status changed to In Progress.`,
        read: true,
      },
      {
        userId: user.id,
        message:
          "We reviewed your latest audit results — a few directories still show an old phone number, and we're getting those corrected this week.",
        read: false,
      },
    ],
  });

  console.log("============================================================");
  console.log("Demo client login:");
  console.log("  email:    demo@riversidefamilydental.example");
  console.log(`  password: ${passwordPlaintext}`);
  console.log("Demo admin password: whatever ADMIN_PASSWORD is set to in .env (check .env.example).");
  console.log("============================================================");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
