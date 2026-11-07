-- AI privacy, provenance, and human-approval hardening.
ALTER TABLE "AgentAction"
  ADD COLUMN "reviewNotes" TEXT,
  ADD COLUMN "reviewedByUserId" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

ALTER TABLE "DamuMessage"
  ADD COLUMN "actorId" TEXT,
  ADD COLUMN "actorRole" TEXT,
  ADD COLUMN "dataClassification" TEXT NOT NULL DEFAULT 'CLINICAL_PHI',
  ADD COLUMN "retentionPolicy" TEXT NOT NULL DEFAULT 'PATIENT_CONTROLLED',
  ADD COLUMN "redactedForStorage" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "transparency" TEXT;

CREATE INDEX "AgentAction_reviewedByUserId_idx" ON "AgentAction"("reviewedByUserId");
CREATE INDEX "DamuMessage_actorId_createdAt_idx" ON "DamuMessage"("actorId", "createdAt");
