/*
  Warnings:

  - You are about to drop the `ActionProposal` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Appointment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CareJourneyEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ConsultationNote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DocumentMetadata` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `patientId` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `appointmentId` on the `CareTask` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `CareTask` table. All the data in the column will be lost.
  - You are about to drop the column `sourceInstruction` on the `CareTask` table. All the data in the column will be lost.
  - You are about to drop the column `grantedAt` on the `CaregiverConsent` table. All the data in the column will be lost.
  - You are about to drop the column `permissionsJson` on the `CaregiverConsent` table. All the data in the column will be lost.
  - You are about to drop the column `revokedAt` on the `CaregiverConsent` table. All the data in the column will be lost.
  - You are about to drop the column `dataSource` on the `HealthObservation` table. All the data in the column will be lost.
  - You are about to drop the column `secondaryValue` on the `HealthObservation` table. All the data in the column will be lost.
  - You are about to drop the column `instructionSource` on the `MedicationSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `timingDetails` on the `MedicationSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `baselineNotes` on the `PatientProfile` table. All the data in the column will be lost.
  - You are about to drop the column `dataSource` on the `PatientProfile` table. All the data in the column will be lost.
  - You are about to alter the column `dateOfBirth` on the `PatientProfile` table. The data in that column could be lost. The data in that column will be cast from `String` to `DateTime`.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `sessionVersion` on the `User` table. All the data in the column will be lost.
  - Added the required column `permissions` to the `CaregiverConsent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CaregiverConsent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MedicationSchedule` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ActionProposal_userId_status_createdAt_idx";

-- DropIndex
DROP INDEX "Appointment_userId_scheduledAt_idx";

-- DropIndex
DROP INDEX "CareJourneyEvent_userId_occurredAt_idx";

-- DropIndex
DROP INDEX "ConsultationNote_userId_createdAt_idx";

-- DropIndex
DROP INDEX "DocumentMetadata_userId_reportDate_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ActionProposal";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Appointment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CareJourneyEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ConsultationNote";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DocumentMetadata";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "HealthDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LAB_REPORT',
    "issuingFacility" TEXT,
    "reportDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "processingStatus" TEXT NOT NULL DEFAULT 'READY',
    "extractedData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HealthDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsultationPrep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clinicianName" TEXT NOT NULL DEFAULT 'Treating Physician',
    "facilityName" TEXT NOT NULL DEFAULT 'OPD Clinic',
    "concernsAndQuestions" TEXT NOT NULL,
    "personalNotes" TEXT,
    "snapshotData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsultationPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summaryText" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssistantProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "actorId", "createdAt", "entityId", "entityType", "id", "metadata") SELECT "action", "actorId", "createdAt", "entityId", "entityType", "id", "metadata" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_actorId_action_idx" ON "AuditLog"("actorId", "action");
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
INSERT INTO "new_CareTask" ("category", "completedAt", "createdAt", "dueAt", "id", "status", "title", "updatedAt", "userId") SELECT "category", "completedAt", "createdAt", "dueAt", "id", "status", "title", "updatedAt", "userId" FROM "CareTask";
DROP TABLE "CareTask";
ALTER TABLE "new_CareTask" RENAME TO "CareTask";
CREATE UNIQUE INDEX "CareTask_idempotencyKey_key" ON "CareTask"("idempotencyKey");
CREATE INDEX "CareTask_userId_status_dueAt_idx" ON "CareTask"("userId", "status", "dueAt");
CREATE TABLE "new_CaregiverConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "caregiverEmail" TEXT NOT NULL,
    "caregiverName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "permissions" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaregiverConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CaregiverConsent" ("caregiverEmail", "caregiverName", "id", "patientId", "relationship", "status") SELECT "caregiverEmail", "caregiverName", "id", "patientId", "relationship", "status" FROM "CaregiverConsent";
DROP TABLE "CaregiverConsent";
ALTER TABLE "new_CaregiverConsent" RENAME TO "CaregiverConsent";
CREATE INDEX "CaregiverConsent_patientId_status_idx" ON "CaregiverConsent"("patientId", "status");
CREATE INDEX "CaregiverConsent_caregiverEmail_status_idx" ON "CaregiverConsent"("caregiverEmail", "status");
CREATE TABLE "new_HealthObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BLOOD_GLUCOSE',
    "numericValue" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mg/dL',
    "context" TEXT NOT NULL DEFAULT 'FASTING',
    "provenance" TEXT NOT NULL DEFAULT 'PATIENT_ENTERED',
    "notes" TEXT,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HealthObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HealthObservation" ("context", "createdAt", "id", "notes", "numericValue", "observedAt", "type", "unit", "userId") SELECT "context", "createdAt", "id", "notes", "numericValue", "observedAt", "type", "unit", "userId" FROM "HealthObservation";
DROP TABLE "HealthObservation";
ALTER TABLE "new_HealthObservation" RENAME TO "HealthObservation";
CREATE INDEX "HealthObservation_userId_observedAt_idx" ON "HealthObservation"("userId", "observedAt");
CREATE INDEX "HealthObservation_userId_type_idx" ON "HealthObservation"("userId", "type");
CREATE TABLE "new_MedicationSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosageInstruction" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MedicationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MedicationSchedule" ("createdAt", "dosageInstruction", "endDate", "frequency", "id", "isActive", "medicationName", "startDate", "userId") SELECT "createdAt", "dosageInstruction", "endDate", "frequency", "id", "isActive", "medicationName", "startDate", "userId" FROM "MedicationSchedule";
DROP TABLE "MedicationSchedule";
ALTER TABLE "new_MedicationSchedule" RENAME TO "MedicationSchedule";
CREATE INDEX "MedicationSchedule_userId_isActive_idx" ON "MedicationSchedule"("userId", "isActive");
CREATE TABLE "new_PatientProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "diabetesType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "diagnosisYear" INTEGER,
    "primaryClinician" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "targetFastingMin" REAL NOT NULL DEFAULT 80.0,
    "targetFastingMax" REAL NOT NULL DEFAULT 130.0,
    "targetPostMealMax" REAL NOT NULL DEFAULT 180.0,
    "knownAllergies" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PatientProfile" ("dateOfBirth", "diabetesType", "diagnosisYear", "fullName", "id", "knownAllergies", "primaryClinician", "updatedAt", "userId") SELECT "dateOfBirth", "diabetesType", "diagnosisYear", "fullName", "id", "knownAllergies", "primaryClinician", "updatedAt", "userId" FROM "PatientProfile";
DROP TABLE "PatientProfile";
ALTER TABLE "new_PatientProfile" RENAME TO "PatientProfile";
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSyntheticDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "isSyntheticDemo", "passwordHash", "updatedAt") SELECT "createdAt", "email", "id", "isSyntheticDemo", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HealthDocument_userId_reportDate_idx" ON "HealthDocument"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "ConsultationPrep_userId_scheduledAt_idx" ON "ConsultationPrep"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AssistantProposal_userId_status_idx" ON "AssistantProposal"("userId", "status");
