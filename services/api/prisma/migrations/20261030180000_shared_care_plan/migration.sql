-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "approvedById" TEXT,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT DEFAULT 'Type 2 Diabetes Mellitus',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "doctorInstructions" TEXT,
    "reviewDate" DATETIME,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CarePlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CarePlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarePlanGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carePlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GLUCOSE',
    "title" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "unit" TEXT,
    "timeframe" TEXT DEFAULT 'Daily',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarePlanGoal_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarePlanActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carePlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'BLOOD_SUGAR_CHECK',
    "title" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "timing" TEXT DEFAULT 'MORNING',
    "instructions" TEXT,
    "isCaregiverEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarePlanActivity_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CareTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "carePlanId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CareTask_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CareTask" ("category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId") SELECT "category", "completedAt", "createdAt", "dueAt", "id", "idempotencyKey", "status", "title", "updatedAt", "userId" FROM "CareTask";
DROP TABLE "CareTask";
ALTER TABLE "new_CareTask" RENAME TO "CareTask";
CREATE UNIQUE INDEX "CareTask_idempotencyKey_key" ON "CareTask"("idempotencyKey");
CREATE INDEX "CareTask_userId_status_dueAt_idx" ON "CareTask"("userId", "status", "dueAt");
CREATE INDEX "CareTask_carePlanId_idx" ON "CareTask"("carePlanId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CarePlan_patientId_status_idx" ON "CarePlan"("patientId", "status");

-- CreateIndex
CREATE INDEX "CarePlan_doctorId_status_idx" ON "CarePlan"("doctorId", "status");

-- CreateIndex
CREATE INDEX "CarePlan_patientId_version_idx" ON "CarePlan"("patientId", "version");

-- CreateIndex
CREATE INDEX "CarePlanGoal_carePlanId_category_idx" ON "CarePlanGoal"("carePlanId", "category");

-- CreateIndex
CREATE INDEX "CarePlanActivity_carePlanId_category_idx" ON "CarePlanActivity"("carePlanId", "category");
