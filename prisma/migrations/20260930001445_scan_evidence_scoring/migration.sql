-- AlterTable
ALTER TABLE "Audit" ADD COLUMN     "ambiguity" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "isMock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastProgressAt" TIMESTAMP(3),
ADD COLUMN     "maxProviderCalls" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "providerCallsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requesterIpHash" TEXT,
ADD COLUMN     "resolvedDomain" TEXT,
ADD COLUMN     "resolvedLocation" TEXT,
ADD COLUMN     "resolvedName" TEXT,
ADD COLUMN     "resolvedWebsite" TEXT,
ADD COLUMN     "runsPerPrompt" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "scanVersion" TEXT,
ADD COLUMN     "scoringVersion" TEXT,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ScanEngine" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model" TEXT,
    "callsMade" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "ScanEngine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanPrompt" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngineRun" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "model" TEXT,
    "runIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "answerText" TEXT,
    "latencyMs" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "noCitations" BOOLEAN NOT NULL DEFAULT false,
    "rawResponse" JSONB,
    "error" TEXT,
    "mentioned" BOOLEAN,
    "mentionPosition" INTEGER,
    "mentionStart" INTEGER,
    "mentionEnd" INTEGER,
    "sentiment" TEXT,
    "accuracy" TEXT,
    "accuracyNotes" TEXT,
    "competitors" JSONB,
    "analysis" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "title" TEXT,
    "tier" INTEGER NOT NULL,
    "tierReason" TEXT,
    "isBusinessOwned" BOOLEAN NOT NULL DEFAULT false,
    "passageStart" INTEGER,
    "passageEnd" INTEGER,
    "passageText" TEXT,
    "citedText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCheck" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "url" TEXT,
    "fetchOk" BOOLEAN NOT NULL DEFAULT false,
    "fetchError" TEXT,
    "httpStatus" INTEGER,
    "finalUrl" TEXT,
    "https" BOOLEAN NOT NULL DEFAULT false,
    "responseMs" INTEGER,
    "htmlBytes" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1" TEXT,
    "wordCount" INTEGER,
    "textRatio" DOUBLE PRECISION,
    "jsRequired" BOOLEAN,
    "metaRobots" TEXT,
    "schemaTypes" JSONB,
    "schemaHasNap" BOOLEAN,
    "hasAboutPage" BOOLEAN,
    "hasContactInfo" BOOLEAN,
    "detectedPhone" TEXT,
    "detectedAddress" TEXT,
    "hasHours" BOOLEAN,
    "hasFaq" BOOLEAN,
    "lastModified" TIMESTAMP(3),
    "robotsFound" BOOLEAN,
    "robots" JSONB,
    "llmsTxtFound" BOOLEAN,
    "sitemapFound" BOOLEAN,
    "sitemapUrl" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorDetected" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "domain" TEXT,
    "mentionCount" INTEGER NOT NULL DEFAULT 0,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "engines" JSONB NOT NULL,
    "evidenceRunIds" JSONB NOT NULL,

    CONSTRAINT "CompetitorDetected_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreBreakdown" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "pointsLost" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScoreBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "pillars" JSONB NOT NULL,
    "caps" JSONB NOT NULL,
    "criticalFailures" JSONB NOT NULL,
    "roadmap" JSONB NOT NULL,
    "costOfInaction" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCache" (
    "id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "runIndex" INTEGER NOT NULL,
    "model" TEXT,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanEngine_auditId_engine_key" ON "ScanEngine"("auditId", "engine");

-- CreateIndex
CREATE UNIQUE INDEX "ScanPrompt_auditId_index_key" ON "ScanPrompt"("auditId", "index");

-- CreateIndex
CREATE INDEX "EngineRun_auditId_status_idx" ON "EngineRun"("auditId", "status");

-- CreateIndex
CREATE INDEX "EngineRun_auditId_engine_idx" ON "EngineRun"("auditId", "engine");

-- CreateIndex
CREATE UNIQUE INDEX "EngineRun_promptId_engine_runIndex_key" ON "EngineRun"("promptId", "engine", "runIndex");

-- CreateIndex
CREATE INDEX "Citation_runId_idx" ON "Citation"("runId");

-- CreateIndex
CREATE INDEX "Citation_auditId_domain_idx" ON "Citation"("auditId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCheck_auditId_key" ON "SiteCheck"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorDetected_auditId_normalizedName_key" ON "CompetitorDetected"("auditId", "normalizedName");

-- CreateIndex
CREATE INDEX "ScoreBreakdown_auditId_idx" ON "ScoreBreakdown"("auditId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_auditId_key" ON "Report"("auditId");

-- CreateIndex
CREATE INDEX "ProviderCache_createdAt_idx" ON "ProviderCache"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCache_engine_promptHash_day_runIndex_key" ON "ProviderCache"("engine", "promptHash", "day", "runIndex");

-- CreateIndex
CREATE INDEX "ProviderEvent_engine_createdAt_idx" ON "ProviderEvent"("engine", "createdAt");

-- CreateIndex
CREATE INDEX "Audit_businessId_status_completedAt_idx" ON "Audit"("businessId", "status", "completedAt");

-- CreateIndex
CREATE INDEX "Audit_requesterIpHash_createdAt_idx" ON "Audit"("requesterIpHash", "createdAt");

-- CreateIndex
CREATE INDEX "Audit_status_lastProgressAt_idx" ON "Audit"("status", "lastProgressAt");

-- CreateIndex
CREATE INDEX "ContactRequest_userId_idx" ON "ContactRequest"("userId");

-- AddForeignKey
ALTER TABLE "ScanEngine" ADD CONSTRAINT "ScanEngine_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanPrompt" ADD CONSTRAINT "ScanPrompt_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineRun" ADD CONSTRAINT "EngineRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngineRun" ADD CONSTRAINT "EngineRun_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "ScanPrompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EngineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteCheck" ADD CONSTRAINT "SiteCheck_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorDetected" ADD CONSTRAINT "CompetitorDetected_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreBreakdown" ADD CONSTRAINT "ScoreBreakdown_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
