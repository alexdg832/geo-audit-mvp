import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

// The demo scan runs on labelled fixtures so the seed never calls a paid engine.
process.env.MOCK_MODE = "true";

const prisma = new PrismaClient();

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
}

async function main() {
  // The seed wipes every table. Refuse anything that is not a local database.
  if (!["127.0.0.1", "localhost"].includes(databaseHost()) && process.env.SEED_RESET !== "1") {
    console.error("Refusing to seed a non-local database. Set SEED_RESET=1 to override deliberately.");
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.contentPush.deleteMany(),
    prisma.truthBrief.deleteMany(),
    prisma.contactRequest.deleteMany(),
    prisma.user.deleteMany(),
    prisma.audit.deleteMany(),
    prisma.business.deleteMany(),
    prisma.providerCache.deleteMany(),
    prisma.providerEvent.deleteMany(),
  ]);

  const business = await prisma.business.create({
    data: {
      name: "Riverside Family Dental",
      website: "https://riversidefamilydental.example.com",
      location: "Portland, OR",
    },
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
      description: "Riverside Family Dental is a family and cosmetic dentistry practice serving Portland, OR and the surrounding area.",
      services: "General dentistry, cosmetic dentistry, teeth whitening, dental implants, emergency dental care",
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
        contentBody: "Add Schema.org LocalBusiness JSON-LD with name, address, phone, and hours so AI assistants can read it directly.",
        status: "In Progress",
      },
    }),
    prisma.contentPush.create({
      data: {
        businessId: business.id,
        title: "New patient FAQ blog post",
        type: "Blog article",
        targetChannel: "Practice blog",
        contentBody: "Draft a short FAQ post covering insurance, new patient forms, and what to expect at a first visit.",
        status: "Planned",
      },
    }),
  ]);

  await prisma.notification.createMany({
    data: [
      { userId: user.id, message: `New content push created: "${plannedPush.title}" (Planned).`, read: false },
      { userId: user.id, message: `"${publishedPush.title}" status changed to Published.`, read: true },
      { userId: user.id, message: `"${inProgressPush.title}" status changed to In Progress.`, read: true },
    ],
  });

  // Demo report: a complete mock-mode scan so the dashboard and admin views have real rows to show.
  const { advanceScan, createScan } = await import("../src/lib/scan/engine");
  const { auditId } = await createScan({
    businessId: business.id,
    name: business.name,
    website: business.website,
    location: business.location,
    requesterIpHash: null,
  });
  for (let i = 0; i < 60; i++) {
    const tick = await advanceScan(auditId);
    if (tick.status !== "running") break;
  }
  const audit = await prisma.audit.findUniqueOrThrow({ where: { id: auditId }, select: { status: true, score: true } });

  console.log("============================================================");
  console.log("Demo client login:");
  console.log("  email:    demo@riversidefamilydental.example");
  console.log(`  password: ${passwordPlaintext}`);
  console.log(`Demo scan: ${audit.status}, score ${audit.score} (mock fixtures, labelled as such in the report)`);
  console.log("Demo admin password: whatever ADMIN_PASSWORD is set to in .env.local (see .env.example).");
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
