-- DropIndex
DROP INDEX "CareExternalLink_externalSystem_facilityId_externalPatientRef_key";

-- DropIndex
DROP INDEX "CareExternalLink_externalSystem_facilityId_idx";

-- DropIndex
DROP INDEX "CareExternalLink_userId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CareExternalLink";
PRAGMA foreign_keys=on;

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CareTask" ("category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId") SELECT "category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId" FROM "CareTask";
DROP TABLE "CareTask";
ALTER TABLE "new_CareTask" RENAME TO "CareTask";
CREATE UNIQUE INDEX "CareTask_idempotencyKey_key" ON "CareTask"("idempotencyKey");
CREATE INDEX "CareTask_userId_status_dueAt_idx" ON "CareTask"("userId", "status", "dueAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
