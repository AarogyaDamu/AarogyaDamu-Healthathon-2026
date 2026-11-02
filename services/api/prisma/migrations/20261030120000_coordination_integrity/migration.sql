-- Expired grants already provide no access. Preserve their history while freeing the active key.
UPDATE "CaregiverConsent" SET "status" = 'EXPIRED' WHERE "status" = 'ACTIVE' AND "expiresAt" IS NOT NULL AND "expiresAt" <= (unixepoch('now') * 1000);
-- Existing duplicate active grants must be reconciled explicitly before deployment.
CREATE UNIQUE INDEX "CaregiverConsent_one_active_per_patient_email" ON "CaregiverConsent" ("patientId", "caregiverEmail") WHERE "status" = 'ACTIVE';

CREATE TRIGGER "Appointment_no_overlap_insert" BEFORE INSERT ON "Appointment"
WHEN NEW."status" IN ('REQUESTED', 'CONFIRMED') AND EXISTS (
  SELECT 1 FROM "Appointment" a WHERE a."doctorId" = NEW."doctorId" AND a."status" IN ('REQUESTED', 'CONFIRMED')
    AND a."scheduledAt" < NEW."scheduledAt" + NEW."durationMinutes" * 60000
    AND NEW."scheduledAt" < a."scheduledAt" + a."durationMinutes" * 60000
)
BEGIN SELECT RAISE(ABORT, 'APPOINTMENT_OVERLAP'); END;

CREATE TRIGGER "Appointment_no_overlap_update" BEFORE UPDATE OF "doctorId", "scheduledAt", "durationMinutes", "status" ON "Appointment"
WHEN NEW."status" IN ('REQUESTED', 'CONFIRMED') AND EXISTS (
  SELECT 1 FROM "Appointment" a WHERE a."id" <> NEW."id" AND a."doctorId" = NEW."doctorId" AND a."status" IN ('REQUESTED', 'CONFIRMED')
    AND a."scheduledAt" < NEW."scheduledAt" + NEW."durationMinutes" * 60000
    AND NEW."scheduledAt" < a."scheduledAt" + a."durationMinutes" * 60000
)
BEGIN SELECT RAISE(ABORT, 'APPOINTMENT_OVERLAP'); END;
