-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSyntheticDemo" BOOLEAN NOT NULL DEFAULT false,
    "isClinician" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "successorHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "diabetesType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "diagnosisYear" INTEGER DEFAULT 2021,
    "primaryClinician" TEXT DEFAULT 'Unassigned',
    "knownAllergies" TEXT DEFAULT 'None documented',
    "targetFastingMin" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "targetFastingMax" DOUBLE PRECISION NOT NULL DEFAULT 130,
    "targetPostMealMax" DOUBLE PRECISION NOT NULL DEFAULT 180,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "preferredLanguage" TEXT DEFAULT 'en',
    "timeZone" TEXT DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BLOOD_GLUCOSE',
    "numericValue" DOUBLE PRECISION NOT NULL,
    "secondaryValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'mg/dL',
    "context" TEXT NOT NULL DEFAULT 'FASTING',
    "clinicalFlag" TEXT DEFAULT 'NORMAL',
    "notes" TEXT,
    "provenance" TEXT NOT NULL DEFAULT 'PATIENT_ENTERED',
    "sourceProvenance" TEXT DEFAULT 'MANUAL_PATIENT',
    "deviceModel" TEXT,
    "idempotencyKey" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "carePlanId" TEXT,
    "completedById" TEXT,
    "completedByRole" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'FOLLOW_UP',
    "instructions" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "recurrence" TEXT,
    "clinicalNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LAB_REPORT',
    "issuingFacility" TEXT,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'READY',
    "extractedData" TEXT,
    "storagePath" TEXT,
    "fileSizeBytes" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationPrep" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicianName" TEXT NOT NULL DEFAULT 'Treating Physician',
    "facilityName" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concernsAndQuestions" TEXT NOT NULL,
    "personalNotes" TEXT,
    "snapshotData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationPrep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicianId" TEXT NOT NULL,
    "clinicianName" TEXT NOT NULL,
    "consultationPrepId" TEXT,
    "appointmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "rawTranscript" TEXT,
    "speakerSegments" TEXT,
    "structuredNote" TEXT,
    "approvedNoteText" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "sharedWithPatient" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "consentDecision" TEXT DEFAULT 'GRANTED',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationNoteVersion" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "revisedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationNoteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaregiverConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "caregiverEmail" TEXT NOT NULL,
    "activeGrantKey" TEXT,
    "caregiverName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "permissions" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "invitationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaregiverConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SCHEDULE_TASK',
    "summaryText" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSchedule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL DEFAULT '',
    "medicationName" TEXT,
    "genericName" TEXT,
    "brandName" TEXT,
    "dosage" TEXT NOT NULL DEFAULT '',
    "dosageInstruction" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "route" TEXT DEFAULT 'ORAL',
    "frequency" TEXT,
    "timing" TEXT NOT NULL DEFAULT 'MORNING',
    "foodInstructions" TEXT,
    "instructions" TEXT,
    "isPrn" BOOLEAN NOT NULL DEFAULT false,
    "prnInstructions" TEXT,
    "prescriber" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PATIENT_ENTERED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "reviewedByClinicianId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "clinicalReviewNotes" TEXT,
    "notes" TEXT,
    "startDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "reasonForChange" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAdherenceEvent" (
    "id" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scheduledTime" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT NOT NULL,
    "sourceProvenance" TEXT NOT NULL DEFAULT 'MANUAL_PATIENT',
    "notes" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationAdherenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorPatientAssignment" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPatientAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "reason" TEXT NOT NULL,
    "visitType" TEXT NOT NULL DEFAULT 'CHECKUP',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "clinicName" TEXT DEFAULT 'Apollo Sugar Clinic, Pune',
    "clinicFacilityId" TEXT,
    "questionnaireResponse" TEXT,
    "rejectionReason" TEXT,
    "cancellationReason" TEXT,
    "rescheduledFromId" TEXT,
    "completedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorAvailability" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '17:00',
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clinicName" TEXT DEFAULT 'Apollo Sugar Clinic, Pune',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorTimeOff" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "approvedById" TEXT,
    "title" TEXT NOT NULL,
    "diagnosis" TEXT DEFAULT 'Type 2 Diabetes Mellitus',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "doctorInstructions" TEXT,
    "reviewDate" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanGoal" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GLUCOSE',
    "title" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "unit" TEXT,
    "timeframe" TEXT DEFAULT 'Daily',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanActivity" (
    "id" TEXT NOT NULL,
    "carePlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'BLOOD_SUGAR_CHECK',
    "title" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY',
    "timing" TEXT DEFAULT 'MORNING',
    "instructions" TEXT,
    "isCaregiverEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarePlanActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareTeamMessage" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "senderRole" TEXT NOT NULL DEFAULT 'PATIENT',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareTeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patientId" TEXT,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'DELIVERED',
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "scheduledFor" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "metadata" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutTier" TEXT NOT NULL DEFAULT 'development',
    "metadata" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAuditRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'Damu',
    "riskTier" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload" TEXT,
    "requiresClinicianApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executionResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAuditRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifestyleRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "unit" TEXT,
    "qualitativeValue" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL_PATIENT',
    "createdById" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reasonForCorrection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifestyleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "carePlanUpdates" BOOLEAN NOT NULL DEFAULT true,
    "medicationReminders" BOOLEAN NOT NULL DEFAULT true,
    "sugarCheckReminders" BOOLEAN NOT NULL DEFAULT true,
    "appointmentReminders" BOOLEAN NOT NULL DEFAULT true,
    "taskReminders" BOOLEAN NOT NULL DEFAULT true,
    "journeyMilestones" BOOLEAN NOT NULL DEFAULT true,
    "consultationUpdates" BOOLEAN NOT NULL DEFAULT true,
    "healthLoggingReminders" BOOLEAN NOT NULL DEFAULT true,
    "emergencyAlerts" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursStart" TEXT DEFAULT '22:00',
    "quietHoursEnd" TEXT DEFAULT '07:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "remindAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "recurrence" TEXT NOT NULL DEFAULT 'ONCE',
    "entityType" TEXT,
    "entityId" TEXT,
    "notes" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnSos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencySosEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activatedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "triggerReason" TEXT,
    "symptoms" TEXT,
    "locationStatus" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "locationAddress" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'IN_APP_DISPATCHED',
    "disclaimerNotice" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencySosEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetPatientId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userIntent" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "highestRiskTier" TEXT NOT NULL DEFAULT 'LOW_RISK',
    "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "version" INTEGER NOT NULL DEFAULT 1,
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT,
    "facilityName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planVersion" INTEGER NOT NULL DEFAULT 1,
    "toolName" TEXT NOT NULL,
    "parameters" TEXT NOT NULL,
    "riskTier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "idempotencyKey" TEXT NOT NULL,
    "confirmedByUserId" TEXT,
    "confirmedByRole" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmationSignature" TEXT,
    "executedAt" TIMESTAMP(3),
    "executionResult" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "auditRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamuConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Health Discussion',
    "language" TEXT NOT NULL DEFAULT 'en',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DamuConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DamuMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "intent" TEXT,
    "sources" TEXT,
    "suggestedFollowUps" TEXT,
    "avatarMode" TEXT,
    "emergencyNotice" BOOLEAN NOT NULL DEFAULT false,
    "isProhibited" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DamuMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'EXPO',
    "deviceInfo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestoneKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventRefType" TEXT,
    "eventRefId" TEXT,
    "actorId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_sessionId_expiresAt_idx" ON "RefreshToken"("sessionId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorInvitation_tokenHash_key" ON "DoctorInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "DoctorInvitation_email_expiresAt_idx" ON "DoctorInvitation"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_action_createdAt_idx" ON "SecurityAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_subject_createdAt_idx" ON "SecurityAuditEvent"("subject", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthObservation_idempotencyKey_key" ON "HealthObservation"("idempotencyKey");

-- CreateIndex
CREATE INDEX "HealthObservation_userId_observedAt_idx" ON "HealthObservation"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "HealthObservation_userId_type_idx" ON "HealthObservation"("userId", "type");

-- CreateIndex
CREATE INDEX "HealthObservation_userId_clinicalFlag_idx" ON "HealthObservation"("userId", "clinicalFlag");

-- CreateIndex
CREATE UNIQUE INDEX "CareTask_idempotencyKey_key" ON "CareTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CareTask_userId_status_dueAt_idx" ON "CareTask"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CareTask_carePlanId_idx" ON "CareTask"("carePlanId");

-- CreateIndex
CREATE INDEX "CareTask_completedById_idx" ON "CareTask"("completedById");

-- CreateIndex
CREATE INDEX "CareTask_assignedById_idx" ON "CareTask"("assignedById");

-- CreateIndex
CREATE INDEX "HealthDocument_userId_reportDate_idx" ON "HealthDocument"("userId", "reportDate");

-- CreateIndex
CREATE INDEX "HealthDocument_userId_category_idx" ON "HealthDocument"("userId", "category");

-- CreateIndex
CREATE INDEX "ConsultationPrep_userId_scheduledAt_idx" ON "ConsultationPrep"("userId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationNote_idempotencyKey_key" ON "ConsultationNote"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ConsultationNote_userId_status_createdAt_idx" ON "ConsultationNote"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultationNote_clinicianId_status_idx" ON "ConsultationNote"("clinicianId", "status");

-- CreateIndex
CREATE INDEX "ConsultationNote_consultationPrepId_idx" ON "ConsultationNote"("consultationPrepId");

-- CreateIndex
CREATE INDEX "ConsultationNote_appointmentId_idx" ON "ConsultationNote"("appointmentId");

-- CreateIndex
CREATE INDEX "ConsultationNoteVersion_noteId_version_idx" ON "ConsultationNoteVersion"("noteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverConsent_activeGrantKey_key" ON "CaregiverConsent"("activeGrantKey");

-- CreateIndex
CREATE INDEX "CaregiverConsent_patientId_caregiverEmail_status_idx" ON "CaregiverConsent"("patientId", "caregiverEmail", "status");

-- CreateIndex
CREATE INDEX "AssistantProposal_userId_status_idx" ON "AssistantProposal"("userId", "status");

-- CreateIndex
CREATE INDEX "MedicationSchedule_userId_status_idx" ON "MedicationSchedule"("userId", "status");

-- CreateIndex
CREATE INDEX "MedicationSchedule_userId_isActive_idx" ON "MedicationSchedule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "MedicationSchedule_userId_reviewStatus_idx" ON "MedicationSchedule"("userId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationAdherenceEvent_idempotencyKey_key" ON "MedicationAdherenceEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MedicationAdherenceEvent_userId_recordedAt_idx" ON "MedicationAdherenceEvent"("userId", "recordedAt");

-- CreateIndex
CREATE INDEX "MedicationAdherenceEvent_medicationId_scheduledTime_idx" ON "MedicationAdherenceEvent"("medicationId", "scheduledTime");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

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

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "DoctorAvailability_doctorId_isActive_idx" ON "DoctorAvailability"("doctorId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorAvailability_doctorId_dayOfWeek_key" ON "DoctorAvailability"("doctorId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DoctorTimeOff_doctorId_startDate_endDate_idx" ON "DoctorTimeOff"("doctorId", "startDate", "endDate");

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

-- CreateIndex
CREATE INDEX "CareTeamMessage_patientId_createdAt_idx" ON "CareTeamMessage"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "CareTeamMessage_senderId_idx" ON "CareTeamMessage"("senderId");

-- CreateIndex
CREATE INDEX "CareTeamMessage_recipientId_isRead_idx" ON "CareTeamMessage"("recipientId", "isRead");

-- CreateIndex
CREATE INDEX "CareNotification_userId_isRead_createdAt_idx" ON "CareNotification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "CareNotification_userId_category_idx" ON "CareNotification"("userId", "category");

-- CreateIndex
CREATE INDEX "CareNotification_patientId_idx" ON "CareNotification"("patientId");

-- CreateIndex
CREATE INDEX "CareNotification_deliveryStatus_scheduledFor_idx" ON "CareNotification"("deliveryStatus", "scheduledFor");

-- CreateIndex
CREATE INDEX "FeatureFlag_isEnabled_idx" ON "FeatureFlag"("isEnabled");

-- CreateIndex
CREATE INDEX "FeatureFlag_rolloutTier_idx" ON "FeatureFlag"("rolloutTier");

-- CreateIndex
CREATE INDEX "AgentAuditRecord_userId_riskTier_idx" ON "AgentAuditRecord"("userId", "riskTier");

-- CreateIndex
CREATE INDEX "AgentAuditRecord_approvalStatus_idx" ON "AgentAuditRecord"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LifestyleRecord_idempotencyKey_key" ON "LifestyleRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LifestyleRecord_userId_category_recordedAt_idx" ON "LifestyleRecord"("userId", "category", "recordedAt");

-- CreateIndex
CREATE INDEX "LifestyleRecord_userId_recordedAt_idx" ON "LifestyleRecord"("userId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_idempotencyKey_key" ON "Reminder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Reminder_userId_status_remindAt_idx" ON "Reminder"("userId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "Reminder_userId_category_idx" ON "Reminder"("userId", "category");

-- CreateIndex
CREATE INDEX "EmergencyContact_userId_isPrimary_idx" ON "EmergencyContact"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencySosEvent_idempotencyKey_key" ON "EmergencySosEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmergencySosEvent_userId_status_createdAt_idx" ON "EmergencySosEvent"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencySosEvent_activatedById_idx" ON "EmergencySosEvent"("activatedById");

-- CreateIndex
CREATE INDEX "AgentPlan_userId_status_idx" ON "AgentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentPlan_targetPatientId_status_idx" ON "AgentPlan"("targetPatientId", "status");

-- CreateIndex
CREATE INDEX "AgentPlan_status_expiresAt_idx" ON "AgentPlan"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentPlan_createdAt_idx" ON "AgentPlan"("createdAt");

-- CreateIndex
CREATE INDEX "AgentPlan_organizationId_idx" ON "AgentPlan"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAction_idempotencyKey_key" ON "AgentAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentAction_planId_status_idx" ON "AgentAction"("planId", "status");

-- CreateIndex
CREATE INDEX "AgentAction_status_expiresAt_idx" ON "AgentAction"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentAction_toolName_idx" ON "AgentAction"("toolName");

-- CreateIndex
CREATE INDEX "AgentAction_confirmedByUserId_idx" ON "AgentAction"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "AgentAction_auditRecordId_idx" ON "AgentAction"("auditRecordId");

-- CreateIndex
CREATE INDEX "DamuConversation_userId_isArchived_idx" ON "DamuConversation"("userId", "isArchived");

-- CreateIndex
CREATE INDEX "DamuConversation_createdAt_idx" ON "DamuConversation"("createdAt");

-- CreateIndex
CREATE INDEX "DamuMessage_conversationId_createdAt_idx" ON "DamuMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");

-- CreateIndex
CREATE INDEX "DevicePushToken_userId_isActive_idx" ON "DevicePushToken"("userId", "isActive");

-- CreateIndex
CREATE INDEX "JourneyMilestone_userId_achievedAt_idx" ON "JourneyMilestone"("userId", "achievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyMilestone_userId_milestoneKey_key" ON "JourneyMilestone"("userId", "milestoneKey");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthObservation" ADD CONSTRAINT "HealthObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTask" ADD CONSTRAINT "CareTask_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthDocument" ADD CONSTRAINT "HealthDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationPrep" ADD CONSTRAINT "ConsultationPrep_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_consultationPrepId_fkey" FOREIGN KEY ("consultationPrepId") REFERENCES "ConsultationPrep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNote" ADD CONSTRAINT "ConsultationNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNoteVersion" ADD CONSTRAINT "ConsultationNoteVersion_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ConsultationNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationNoteVersion" ADD CONSTRAINT "ConsultationNoteVersion_revisedBy_fkey" FOREIGN KEY ("revisedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaregiverConsent" ADD CONSTRAINT "CaregiverConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantProposal" ADD CONSTRAINT "AssistantProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdherenceEvent" ADD CONSTRAINT "MedicationAdherenceEvent_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdherenceEvent" ADD CONSTRAINT "MedicationAdherenceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAssignment" ADD CONSTRAINT "DoctorPatientAssignment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorPatientAssignment" ADD CONSTRAINT "DoctorPatientAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAvailability" ADD CONSTRAINT "DoctorAvailability_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorTimeOff" ADD CONSTRAINT "DoctorTimeOff_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanGoal" ADD CONSTRAINT "CarePlanGoal_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanActivity" ADD CONSTRAINT "CarePlanActivity_carePlanId_fkey" FOREIGN KEY ("carePlanId") REFERENCES "CarePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTeamMessage" ADD CONSTRAINT "CareTeamMessage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTeamMessage" ADD CONSTRAINT "CareTeamMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareTeamMessage" ADD CONSTRAINT "CareTeamMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareNotification" ADD CONSTRAINT "CareNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAuditRecord" ADD CONSTRAINT "AgentAuditRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifestyleRecord" ADD CONSTRAINT "LifestyleRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencySosEvent" ADD CONSTRAINT "EmergencySosEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_targetPatientId_fkey" FOREIGN KEY ("targetPatientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AgentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_auditRecordId_fkey" FOREIGN KEY ("auditRecordId") REFERENCES "AgentAuditRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamuConversation" ADD CONSTRAINT "DamuConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DamuMessage" ADD CONSTRAINT "DamuMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DamuConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyMilestone" ADD CONSTRAINT "JourneyMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

