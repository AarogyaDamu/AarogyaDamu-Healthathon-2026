-- Add token-version revocation support for stateless bearer sessions.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Indexes follow the authenticated user/tenant filters and deterministic sort paths.
CREATE INDEX "MedicationSchedule_userId_isActive_idx" ON "MedicationSchedule"("userId", "isActive");
CREATE INDEX "Appointment_userId_scheduledAt_idx" ON "Appointment"("userId", "scheduledAt");
CREATE INDEX "DocumentMetadata_userId_reportDate_idx" ON "DocumentMetadata"("userId", "reportDate");
CREATE INDEX "ConsultationNote_userId_createdAt_idx" ON "ConsultationNote"("userId", "createdAt");
CREATE INDEX "ActionProposal_userId_status_createdAt_idx" ON "ActionProposal"("userId", "status", "createdAt");
