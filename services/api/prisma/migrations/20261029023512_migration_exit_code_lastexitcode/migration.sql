/*
  Warnings:

  - You are about to drop the column `endDate` on the `MedicationSchedule` table. All the data in the column will be lost.
  - Made the column `userId` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "CaregiverConsent_caregiverEmail_status_idx";

-- DropIndex
DROP INDEX "CaregiverConsent_patientId_status_idx";

-- DropIndex
DROP INDEX "User_email_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssistantProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SCHEDULE_TASK',
    "summaryText" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssistantProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AssistantProposal" ("createdAt", "expiresAt", "id", "payload", "status", "summaryText", "type", "updatedAt", "userId") SELECT "createdAt", "expiresAt", "id", "payload", "status", "summaryText", "type", "updatedAt", "userId" FROM "AssistantProposal";
DROP TABLE "AssistantProposal";
ALTER TABLE "new_AssistantProposal" RENAME TO "AssistantProposal";
CREATE INDEX "AssistantProposal_userId_status_idx" ON "AssistantProposal"("userId", "status");
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorId", "createdAt", "entityId", "entityType", "id", "ipAddress", "metadata", "userAgent", "userId") SELECT "action", "actorId", "createdAt", "entityId", "entityType", "id", "ipAddress", "metadata", "userAgent", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE TABLE "new_ConsultationPrep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clinicianName" TEXT NOT NULL DEFAULT 'Dr. Anjali Kulkarni (Endocrinologist)',
    "facilityName" TEXT NOT NULL DEFAULT 'Sahyadri Specialty Hospital',
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concernsAndQuestions" TEXT NOT NULL,
    "personalNotes" TEXT,
    "snapshotData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsultationPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConsultationPrep" ("clinicianName", "concernsAndQuestions", "createdAt", "facilityName", "id", "personalNotes", "scheduledAt", "snapshotData", "updatedAt", "userId") SELECT "clinicianName", "concernsAndQuestions", "createdAt", "facilityName", "id", "personalNotes", "scheduledAt", "snapshotData", "updatedAt", "userId" FROM "ConsultationPrep";
DROP TABLE "ConsultationPrep";
ALTER TABLE "new_ConsultationPrep" RENAME TO "ConsultationPrep";
CREATE INDEX "ConsultationPrep_userId_scheduledAt_idx" ON "ConsultationPrep"("userId", "scheduledAt");
CREATE TABLE "new_MedicationSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL DEFAULT '',
    "medicationName" TEXT,
    "dosage" TEXT NOT NULL DEFAULT '',
    "dosageInstruction" TEXT,
    "frequency" TEXT,
    "timing" TEXT NOT NULL DEFAULT 'MORNING',
    "notes" TEXT,
    "startDate" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MedicationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MedicationSchedule" ("createdAt", "dosageInstruction", "frequency", "id", "isActive", "medicationName", "notes", "startDate", "updatedAt", "userId") SELECT "createdAt", "dosageInstruction", "frequency", "id", "isActive", "medicationName", "notes", "startDate", "updatedAt", "userId" FROM "MedicationSchedule";
DROP TABLE "MedicationSchedule";
ALTER TABLE "new_MedicationSchedule" RENAME TO "MedicationSchedule";
CREATE INDEX "MedicationSchedule_userId_isActive_idx" ON "MedicationSchedule"("userId", "isActive");
CREATE TABLE "new_PatientProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "diabetesType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "diagnosisYear" INTEGER DEFAULT 2021,
    "primaryClinician" TEXT DEFAULT 'Unassigned',
    "knownAllergies" TEXT DEFAULT 'None documented',
    "targetFastingMin" REAL NOT NULL DEFAULT 80,
    "targetFastingMax" REAL NOT NULL DEFAULT 130,
    "targetPostMealMax" REAL NOT NULL DEFAULT 180,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "preferredLanguage" TEXT DEFAULT 'en',
    "timeZone" TEXT DEFAULT 'Asia/Kolkata',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PatientProfile" ("createdAt", "dateOfBirth", "diabetesType", "diagnosisYear", "emergencyContactName", "emergencyContactPhone", "fullName", "id", "knownAllergies", "preferredLanguage", "primaryClinician", "targetFastingMax", "targetFastingMin", "targetPostMealMax", "timeZone", "updatedAt", "userId") SELECT "createdAt", "dateOfBirth", "diabetesType", "diagnosisYear", "emergencyContactName", "emergencyContactPhone", "fullName", "id", "knownAllergies", "preferredLanguage", "primaryClinician", "targetFastingMax", "targetFastingMin", "targetPostMealMax", "timeZone", "updatedAt", "userId" FROM "PatientProfile";
DROP TABLE "PatientProfile";
ALTER TABLE "new_PatientProfile" RENAME TO "PatientProfile";
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CaregiverConsent_patientId_caregiverEmail_status_idx" ON "CaregiverConsent"("patientId", "caregiverEmail", "status");

-- CreateIndex
CREATE INDEX "HealthDocument_userId_category_idx" ON "HealthDocument"("userId", "category");
