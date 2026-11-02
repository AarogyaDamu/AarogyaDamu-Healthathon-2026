-- CreateTable
CREATE TABLE "DoctorPatientAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DoctorPatientAssignment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DoctorPatientAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT NOT NULL,
    "visitType" TEXT NOT NULL DEFAULT 'CHECKUP',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConsultationPrep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clinicianName" TEXT NOT NULL DEFAULT 'Treating Physician',
    "facilityName" TEXT,
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DoctorPatientAssignment_doctorId_status_idx" ON "DoctorPatientAssignment"("doctorId", "status");

-- CreateIndex
CREATE INDEX "DoctorPatientAssignment_patientId_status_idx" ON "DoctorPatientAssignment"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPatientAssignment_doctorId_patientId_key" ON "DoctorPatientAssignment"("doctorId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_idempotencyKey_key" ON "Appointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Appointment_patientId_scheduledAt_status_idx" ON "Appointment"("patientId", "scheduledAt", "status");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_scheduledAt_status_idx" ON "Appointment"("doctorId", "scheduledAt", "status");
