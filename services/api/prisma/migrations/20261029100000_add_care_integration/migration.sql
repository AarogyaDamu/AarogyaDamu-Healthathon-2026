-- CreateTable
CREATE TABLE "CareExternalLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "externalSystem" TEXT NOT NULL DEFAULT 'OHC_CARE',
    "externalPatientRef" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareExternalLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CareTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "idempotencyKey" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PATIENT',
    "externalCareRef" TEXT,
    "externalFacilityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CareTask" ("category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId") SELECT "category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId" FROM "CareTask";
DROP TABLE "CareTask";
ALTER TABLE "new_CareTask" RENAME TO "CareTask";
CREATE UNIQUE INDEX "CareTask_idempotencyKey_key" ON "CareTask"("idempotencyKey");
CREATE UNIQUE INDEX "CareTask_externalCareRef_key" ON "CareTask"("externalCareRef");
CREATE INDEX "CareTask_userId_status_dueAt_idx" ON "CareTask"("userId", "status", "dueAt");
CREATE INDEX "CareTask_userId_source_idx" ON "CareTask"("userId", "source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CareExternalLink_userId_key" ON "CareExternalLink"("userId");

-- CreateIndex
CREATE INDEX "CareExternalLink_externalSystem_facilityId_idx" ON "CareExternalLink"("externalSystem", "facilityId");

-- CreateIndex
CREATE UNIQUE INDEX "CareExternalLink_externalSystem_facilityId_externalPatientRef_key" ON "CareExternalLink"("externalSystem", "facilityId", "externalPatientRef");
