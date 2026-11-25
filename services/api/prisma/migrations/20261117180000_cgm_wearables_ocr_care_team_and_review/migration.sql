-- ==============================================================================
-- Migration: 20261117180000_cgm_wearables_ocr_care_team_and_review
-- Purpose: CGM & Wearables, Sarvam Document Intelligence OCR, Multidisciplinary Care Team,
--          Clinical Review Workspace, and CareNotification Least-Privilege RLS Hardening.
-- ==============================================================================

-- 1. Create CgmDeviceConnection Table
CREATE TABLE IF NOT EXISTS "CgmDeviceConnection" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connectionStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "deviceName" TEXT NOT NULL,
    "deviceModel" TEXT,
    "serialNumber" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "authExpiresAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "sharingConsentRevokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgmDeviceConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CgmDeviceConnection_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CgmDeviceConnection_patientId_provider_idx" ON "CgmDeviceConnection"("patientId", "provider");
CREATE INDEX IF NOT EXISTS "CgmDeviceConnection_patientId_connectionStatus_idx" ON "CgmDeviceConnection"("patientId", "connectionStatus");

-- 2. Create CgmGlucoseReading Table
CREATE TABLE IF NOT EXISTS "CgmGlucoseReading" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "deviceConnectionId" TEXT,
    "glucoseValueMgDl" DOUBLE PRECISION NOT NULL,
    "glucoseValueMmolL" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'mg/dL',
    "trendArrow" TEXT DEFAULT 'FLAT',
    "readingType" TEXT NOT NULL DEFAULT 'INTERSTITIAL_CGM',
    "loincCode" TEXT NOT NULL DEFAULT '99504-3',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "sourceTimezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isOutlier" BOOLEAN NOT NULL DEFAULT false,
    "dataQualityStatus" TEXT NOT NULL DEFAULT 'VALID',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CgmGlucoseReading_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CgmGlucoseReading_idempotencyKey_key" UNIQUE ("idempotencyKey"),
    CONSTRAINT "CgmGlucoseReading_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CgmGlucoseReading_deviceConnectionId_fkey" FOREIGN KEY ("deviceConnectionId") REFERENCES "CgmDeviceConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CgmGlucoseReading_patientId_observedAt_idx" ON "CgmGlucoseReading"("patientId", "observedAt");
CREATE INDEX IF NOT EXISTS "CgmGlucoseReading_patientId_dataQualityStatus_idx" ON "CgmGlucoseReading"("patientId", "dataQualityStatus");

-- 3. Create OcrProcessingJob Table
CREATE TABLE IF NOT EXISTS "OcrProcessingJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'SARVAM_DOC_AI',
    "operation" TEXT NOT NULL DEFAULT 'PARSE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "documentType" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "creditCostEstimated" INTEGER NOT NULL DEFAULT 1,
    "creditCostActual" INTEGER,
    "rawOcrText" TEXT,
    "extractedSchemaJson" TEXT,
    "confidenceScoresJson" TEXT,
    "processingDurationMs" INTEGER,
    "errorMessage" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewerNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrProcessingJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OcrProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "HealthDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OcrProcessingJob_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OcrProcessingJob_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OcrProcessingJob_patientId_createdAt_idx" ON "OcrProcessingJob"("patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "OcrProcessingJob_documentId_idx" ON "OcrProcessingJob"("documentId");
CREATE INDEX IF NOT EXISTS "OcrProcessingJob_status_approvalStatus_idx" ON "OcrProcessingJob"("status", "approvalStatus");

-- 4. Create OcrUsageLog Table
CREATE TABLE IF NOT EXISTS "OcrUsageLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SARVAM_DOC_AI',
    "operation" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "creditsDeducted" INTEGER NOT NULL,
    "remainingCreditsEstimated" INTEGER NOT NULL,
    "documentType" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OcrUsageLog_recordedAt_idx" ON "OcrUsageLog"("recordedAt");
CREATE INDEX IF NOT EXISTS "OcrUsageLog_provider_idx" ON "OcrUsageLog"("provider");

-- 5. Create PatientCareTeamMember Table
CREATE TABLE IF NOT EXISTS "PatientCareTeamMember" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "practiceId" TEXT,
    "assignedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientCareTeamMember_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PatientCareTeamMember_patientId_userId_key" UNIQUE ("patientId", "userId"),
    CONSTRAINT "PatientCareTeamMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatientCareTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PatientCareTeamMember_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PatientCareTeamMember_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PatientCareTeamMember_patientId_status_idx" ON "PatientCareTeamMember"("patientId", "status");
CREATE INDEX IF NOT EXISTS "PatientCareTeamMember_userId_status_idx" ON "PatientCareTeamMember"("userId", "status");

-- 6. Create ClinicalReviewEncounter Table
CREATE TABLE IF NOT EXISTS "ClinicalReviewEncounter" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "initialReviewerId" TEXT,
    "initialReviewedAt" TIMESTAMP(3),
    "doctorReviewerId" TEXT,
    "doctorReviewedAt" TIMESTAMP(3),
    "doctorSignature" TEXT,
    "correctionNotes" TEXT,
    "clinicalSummaryNote" TEXT,
    "checklistJson" TEXT NOT NULL,
    "dataSnapshotHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalReviewEncounter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalReviewEncounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClinicalReviewEncounter_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClinicalReviewEncounter_initialReviewerId_fkey" FOREIGN KEY ("initialReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClinicalReviewEncounter_doctorReviewerId_fkey" FOREIGN KEY ("doctorReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClinicalReviewEncounter_patientId_createdAt_idx" ON "ClinicalReviewEncounter"("patientId", "createdAt");
CREATE INDEX IF NOT EXISTS "ClinicalReviewEncounter_practiceId_status_idx" ON "ClinicalReviewEncounter"("practiceId", "status");

-- 7. Enable RLS on New Tables
ALTER TABLE "CgmDeviceConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CgmGlucoseReading" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrProcessingJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OcrUsageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PatientCareTeamMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalReviewEncounter" ENABLE ROW LEVEL SECURITY;

-- 8. Command-Specific Least-Privilege Policies for CareNotification
DROP POLICY IF EXISTS care_notification_policy ON "CareNotification";
DROP POLICY IF EXISTS care_notification_select_policy ON "CareNotification";
DROP POLICY IF EXISTS care_notification_insert_policy ON "CareNotification";
DROP POLICY IF EXISTS care_notification_update_policy ON "CareNotification";
DROP POLICY IF EXISTS care_notification_delete_policy ON "CareNotification";

CREATE POLICY care_notification_select_policy ON "CareNotification"
FOR SELECT TO aarogyadamu_app
USING (
    ("userId" = current_app_user_id()) OR 
    ("patientId" = current_app_user_id())
);

CREATE POLICY care_notification_insert_policy ON "CareNotification"
FOR INSERT TO aarogyadamu_app
WITH CHECK (
    ("userId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId") OR 
    ("patientId" = current_app_patient_id())
);

CREATE POLICY care_notification_update_policy ON "CareNotification"
FOR UPDATE TO aarogyadamu_app
USING ("userId" = current_app_user_id())
WITH CHECK ("userId" = current_app_user_id());

CREATE POLICY care_notification_delete_policy ON "CareNotification"
FOR DELETE TO aarogyadamu_app
USING ("userId" = current_app_user_id());

-- 9. RLS Policies for CgmDeviceConnection
CREATE POLICY cgm_device_select_policy ON "CgmDeviceConnection"
FOR SELECT TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    ("patientId" = current_app_patient_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY cgm_device_insert_policy ON "CgmDeviceConnection"
FOR INSERT TO aarogyadamu_app
WITH CHECK (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY cgm_device_update_policy ON "CgmDeviceConnection"
FOR UPDATE TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
)
WITH CHECK (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY cgm_device_delete_policy ON "CgmDeviceConnection"
FOR DELETE TO aarogyadamu_app
USING ("patientId" = current_app_user_id());

-- 10. RLS Policies for CgmGlucoseReading
CREATE POLICY cgm_reading_select_policy ON "CgmGlucoseReading"
FOR SELECT TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    ("patientId" = current_app_patient_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY cgm_reading_insert_policy ON "CgmGlucoseReading"
FOR INSERT TO aarogyadamu_app
WITH CHECK (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

-- 11. RLS Policies for OcrProcessingJob
CREATE POLICY ocr_job_select_policy ON "OcrProcessingJob"
FOR SELECT TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    ("patientId" = current_app_patient_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY ocr_job_mutation_policy ON "OcrProcessingJob"
FOR ALL TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
)
WITH CHECK (
    ("patientId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

-- 12. RLS Policies for OcrUsageLog
CREATE POLICY ocr_usage_policy ON "OcrUsageLog"
FOR ALL TO aarogyadamu_app
USING (true)
WITH CHECK (true);

-- 13. RLS Policies for PatientCareTeamMember
CREATE POLICY care_team_select_policy ON "PatientCareTeamMember"
FOR SELECT TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    ("userId" = current_app_user_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY care_team_mutation_policy ON "PatientCareTeamMember"
FOR ALL TO aarogyadamu_app
USING (is_doctor_assigned_to_patient(current_app_user_id(), "patientId"))
WITH CHECK (is_doctor_assigned_to_patient(current_app_user_id(), "patientId"));

-- 14. RLS Policies for ClinicalReviewEncounter
CREATE POLICY clinical_review_select_policy ON "ClinicalReviewEncounter"
FOR SELECT TO aarogyadamu_app
USING (
    ("patientId" = current_app_user_id()) OR 
    ("patientId" = current_app_patient_id()) OR 
    is_doctor_assigned_to_patient(current_app_user_id(), "patientId")
);

CREATE POLICY clinical_review_mutation_policy ON "ClinicalReviewEncounter"
FOR ALL TO aarogyadamu_app
USING (is_doctor_assigned_to_patient(current_app_user_id(), "patientId"))
WITH CHECK (is_doctor_assigned_to_patient(current_app_user_id(), "patientId"));

-- 15. Explicit Least-Privilege Grants for Application Runtime Role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE 
    "CgmDeviceConnection",
    "CgmGlucoseReading",
    "OcrProcessingJob",
    "OcrUsageLog",
    "PatientCareTeamMember",
    "ClinicalReviewEncounter" 
TO aarogyadamu_app;

-- 16. Enforce FORCE ROW LEVEL SECURITY (owner/table-level bypass protection)
ALTER TABLE "CgmDeviceConnection" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CgmGlucoseReading" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OcrProcessingJob" FORCE ROW LEVEL SECURITY;
ALTER TABLE "OcrUsageLog" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PatientCareTeamMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalReviewEncounter" FORCE ROW LEVEL SECURITY;

