-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" BIGSERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "lineUuid" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "projectPath" TEXT NOT NULL,
    "gitBranch" TEXT,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheCreate1hTokens" INTEGER NOT NULL,
    "cacheCreate5mTokens" INTEGER NOT NULL,
    "cacheReadTokens" INTEGER NOT NULL,
    "webSearchCount" INTEGER NOT NULL,
    "webFetchCount" INTEGER NOT NULL,
    "serviceTier" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestCursor" (
    "filePath" TEXT NOT NULL,
    "inode" TEXT NOT NULL,
    "bytesRead" BIGINT NOT NULL,
    "lastUuid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestCursor_pkey" PRIMARY KEY ("filePath")
);

-- CreateTable
CREATE TABLE "QuotaSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiveHourUsed" DOUBLE PRECISION NOT NULL,
    "fiveHourLimit" DOUBLE PRECISION NOT NULL,
    "fiveHourResetsAt" TIMESTAMP(3),
    "weeklyUsed" DOUBLE PRECISION NOT NULL,
    "weeklyLimit" DOUBLE PRECISION NOT NULL,
    "weeklyResetsAt" TIMESTAMP(3),
    "extraCredits" DOUBLE PRECISION NOT NULL,
    "subscriptionType" TEXT,
    "rateLimitTier" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL,

    CONSTRAINT "QuotaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "accessToken" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_ts_idx" ON "UsageEvent"("ts");

-- CreateIndex
CREATE INDEX "UsageEvent_model_idx" ON "UsageEvent"("model");

-- CreateIndex
CREATE INDEX "UsageEvent_sessionId_idx" ON "UsageEvent"("sessionId");

-- CreateIndex
CREATE INDEX "UsageEvent_projectPath_idx" ON "UsageEvent"("projectPath");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_requestId_lineUuid_key" ON "UsageEvent"("requestId", "lineUuid");

-- CreateIndex
CREATE INDEX "QuotaSnapshot_capturedAt_idx" ON "QuotaSnapshot"("capturedAt");
