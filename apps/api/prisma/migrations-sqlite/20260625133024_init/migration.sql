-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "requestId" TEXT NOT NULL,
    "lineUuid" TEXT NOT NULL,
    "ts" DATETIME NOT NULL,
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
    "costUsd" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "IngestCursor" (
    "filePath" TEXT NOT NULL PRIMARY KEY,
    "inode" TEXT NOT NULL,
    "bytesRead" BIGINT NOT NULL,
    "lastUuid" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QuotaSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fiveHourUsed" REAL NOT NULL,
    "fiveHourLimit" REAL NOT NULL,
    "fiveHourResetsAt" DATETIME,
    "weeklyUsed" REAL NOT NULL,
    "weeklyLimit" REAL NOT NULL,
    "weeklyResetsAt" DATETIME,
    "extraCredits" REAL NOT NULL,
    "subscriptionType" TEXT,
    "rateLimitTier" TEXT,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "accessToken" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL
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
