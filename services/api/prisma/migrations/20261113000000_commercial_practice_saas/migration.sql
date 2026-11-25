-- Commercial SaaS & Practice Management Models
ALTER TABLE "ConsultationNote"
  ADD COLUMN "clinicalDiagnosisJson" TEXT,
  ADD COLUMN "examinationFindingsJson" TEXT,
  ADD COLUMN "labOrdersJson" TEXT,
  ADD COLUMN "lifestyleAdvice" TEXT;

CREATE TABLE "Practice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "council" TEXT,
    "specialty" TEXT NOT NULL DEFAULT 'Diabetology & General Medicine',
    "qualifications" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "phone" TEXT,
    "consultationFeeInr" INTEGER NOT NULL DEFAULT 500,
    "workingDays" TEXT NOT NULL DEFAULT 'MON,TUE,WED,THU,FRI,SAT',
    "workingHoursJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Practice_slug_key" ON "Practice"("slug");
CREATE INDEX "Practice_slug_idx" ON "Practice"("slug");
CREATE INDEX "Practice_registrationNumber_idx" ON "Practice"("registrationNumber");

CREATE TABLE "PracticeMembership" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'DOCTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PracticeMembership_practiceId_userId_key" ON "PracticeMembership"("practiceId", "userId");
CREATE INDEX "PracticeMembership_userId_isActive_idx" ON "PracticeMembership"("userId", "isActive");
CREATE INDEX "PracticeMembership_practiceId_role_idx" ON "PracticeMembership"("practiceId", "role");

ALTER TABLE "PracticeMembership" ADD CONSTRAINT "PracticeMembership_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeMembership" ADD CONSTRAINT "PracticeMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PatientEncounterBilling" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "doctorId" TEXT NOT NULL,
    "consultationFeeInr" INTEGER NOT NULL,
    "discountInr" INTEGER NOT NULL DEFAULT 0,
    "totalAmountInr" INTEGER NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paymentMethod" TEXT NOT NULL DEFAULT 'UPI',
    "receiptNumber" TEXT NOT NULL,
    "transactionReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientEncounterBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientEncounterBilling_appointmentId_key" ON "PatientEncounterBilling"("appointmentId");
CREATE UNIQUE INDEX "PatientEncounterBilling_receiptNumber_key" ON "PatientEncounterBilling"("receiptNumber");
CREATE INDEX "PatientEncounterBilling_practiceId_createdAt_idx" ON "PatientEncounterBilling"("practiceId", "createdAt");
CREATE INDEX "PatientEncounterBilling_patientId_createdAt_idx" ON "PatientEncounterBilling"("patientId", "createdAt");
CREATE INDEX "PatientEncounterBilling_doctorId_createdAt_idx" ON "PatientEncounterBilling"("doctorId", "createdAt");

ALTER TABLE "PatientEncounterBilling" ADD CONSTRAINT "PatientEncounterBilling_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientEncounterBilling" ADD CONSTRAINT "PatientEncounterBilling_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientEncounterBilling" ADD CONSTRAINT "PatientEncounterBilling_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientEncounterBilling" ADD CONSTRAINT "PatientEncounterBilling_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ConsultationTemplate" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "doctorId" TEXT,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL DEFAULT 'Diabetology',
    "chiefComplaint" TEXT,
    "defaultDiagnosesJson" TEXT,
    "defaultPrescriptionsJson" TEXT,
    "defaultLabOrdersJson" TEXT,
    "defaultLifestyleAdvice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationTemplate_practiceId_idx" ON "ConsultationTemplate"("practiceId");

ALTER TABLE "ConsultationTemplate" ADD CONSTRAINT "ConsultationTemplate_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsultationPrescriptionItem" (
    "id" TEXT NOT NULL,
    "consultationNoteId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationPrescriptionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationPrescriptionItem_consultationNoteId_idx" ON "ConsultationPrescriptionItem"("consultationNoteId");

ALTER TABLE "ConsultationPrescriptionItem" ADD CONSTRAINT "ConsultationPrescriptionItem_consultationNoteId_fkey" FOREIGN KEY ("consultationNoteId") REFERENCES "ConsultationNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

