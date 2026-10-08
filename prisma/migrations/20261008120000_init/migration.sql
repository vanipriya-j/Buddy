-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeeklyTemplate_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "templateId" TEXT,
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scheduledTime" TEXT,
    "estimatedMinutes" INTEGER NOT NULL,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceDays" TEXT NOT NULL DEFAULT '[]',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "stepCount" INTEGER NOT NULL DEFAULT 3,
    "breakAfter" BOOLEAN NOT NULL DEFAULT false,
    "breakMinutes" INTEGER NOT NULL DEFAULT 5,
    "rewardStars" INTEGER NOT NULL DEFAULT 1,
    "rewardNote" TEXT NOT NULL DEFAULT '',
    "completionCriteria" TEXT NOT NULL DEFAULT '',
    "learningNotes" TEXT NOT NULL DEFAULT '',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "onlyDate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WeeklyTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Material_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "baselineMinutes" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "autoSkipped" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "refusalCount" INTEGER NOT NULL DEFAULT 0,
    "helpCount" INTEGER NOT NULL DEFAULT 0,
    "breakCount" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "workAnchor" DATETIME,
    "coachJson" TEXT NOT NULL DEFAULT '',
    "completionNote" TEXT NOT NULL DEFAULT '',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "DailyInstance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "limitMinutes" INTEGER NOT NULL,
    "buttonsOnly" BOOLEAN NOT NULL DEFAULT false,
    "parentPresentAt" DATETIME NOT NULL,
    "lastCheckInAt" DATETIME NOT NULL,
    "checkInIntervalMinutes" INTEGER NOT NULL DEFAULT 10,
    "currentInstanceId" TEXT,
    "coachJson" TEXT NOT NULL DEFAULT '',
    "greeted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Session_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "instanceId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "instanceId" TEXT,
    "kind" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reward_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reward_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "DailyInstance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "instanceId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Observation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Child_parentId_key" ON "Child"("parentId");

-- CreateIndex
CREATE INDEX "Activity_parentId_isLive_active_idx" ON "Activity"("parentId", "isLive", "active");

-- CreateIndex
CREATE INDEX "DailyInstance_date_idx" ON "DailyInstance"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyInstance_activityId_date_key" ON "DailyInstance"("activityId", "date");

-- CreateIndex
CREATE INDEX "Session_parentId_date_idx" ON "Session"("parentId", "date");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId");

-- CreateIndex
CREATE INDEX "Observation_parentId_date_idx" ON "Observation"("parentId", "date");

