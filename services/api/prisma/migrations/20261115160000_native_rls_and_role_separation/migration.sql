-- AarogyaDamu Migration: 20261115160000_native_rls_and_role_separation
-- Description: Establishes native PostgreSQL Row-Level Security (RLS) across all 45 public application tables,
-- provisions restricted runtime role 'aarogyadamu_app', migrator role 'aarogyadamu_migrator',
-- and defines security definer helper functions for transaction-local tenant context.

-- 1. PROVISION DATABASE ROLES (Render-compatible: tolerates managed Postgres without SUPERUSER/CREATEDB/CREATEROLE when pre-provisioned)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    BEGIN
      CREATE ROLE aarogyadamu_migrator WITH LOGIN PASSWORD 'AarogyaMigrator2026!'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Skipping aarogyadamu_migrator role creation (current role lacks CREATEROLE; using primary database owner).';
    END;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_app') THEN
    BEGIN
      CREATE ROLE aarogyadamu_app WITH LOGIN PASSWORD 'AarogyaAppRuntime2026!'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'Required runtime role aarogyadamu_app does not exist and current role lacks CREATEROLE. Pre-create aarogyadamu_app in managed PostgreSQL before deploying migrations.';
    END;
  END IF;
END
$$;

-- 2. GRANT MINIMAL REQUIRED PRIVILEGES
GRANT USAGE ON SCHEMA public TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT USAGE, CREATE ON SCHEMA public TO aarogyadamu_migrator;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aarogyadamu_migrator;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aarogyadamu_migrator;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aarogyadamu_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aarogyadamu_app;

-- Revoke TRUNCATE and DDL from normal application runtime
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM aarogyadamu_app;

-- Revoke access to internal Prisma migrations table from application role
REVOKE ALL ON TABLE "_prisma_migrations" FROM aarogyadamu_app;

-- 3. SECURITY DEFINER HELPER FUNCTIONS (TRANSACTION-LOCAL SESSION CONTEXT)
CREATE OR REPLACE FUNCTION public.current_app_user_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_app_practice_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_practice_id', true), '');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_app_patient_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_patient_id', true), '');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_system_worker() RETURNS BOOLEAN AS $$
  SELECT COALESCE(current_setting('app.is_system_worker', true) = 'true', false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_doctor_assigned_to_patient(p_doc TEXT, p_patient TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "DoctorPatientAssignment"
    WHERE "doctorId" = p_doc AND "patientId" = p_patient AND "status" = 'ACTIVE'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_caregiver_consent(p_caregiver_user TEXT, p_patient TEXT, p_permission TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "CaregiverConsent" cc
    JOIN "User" u ON u.email = cc."caregiverEmail"
    WHERE u.id = p_caregiver_user 
      AND cc."patientId" = p_patient 
      AND cc."status" = 'ACTIVE' 
      AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
      AND (p_permission IS NULL OR cc."permissions" LIKE '%' || p_permission || '%')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO aarogyadamu_app;
GRANT EXECUTE ON FUNCTION public.current_app_practice_id() TO aarogyadamu_app;
GRANT EXECUTE ON FUNCTION public.current_app_patient_id() TO aarogyadamu_app;
GRANT EXECUTE ON FUNCTION public.is_system_worker() TO aarogyadamu_app;
GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_app;
GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_practice_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_patient_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.is_system_worker() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;

-- 4. ENABLE ROW LEVEL SECURITY & DEFINE NATIVE POLICIES

-- Practice
ALTER TABLE "Practice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS practice_tenant_policy ON "Practice";
CREATE POLICY practice_tenant_policy ON "Practice"
  FOR ALL TO aarogyadamu_app
  USING (
    id = public.current_app_practice_id()
    OR id IN (SELECT "practiceId" FROM "PracticeMembership" WHERE "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  )
  WITH CHECK (
    id = public.current_app_practice_id()
    OR public.is_system_worker()
    OR public.current_app_user_id() IS NOT NULL
  );

-- PracticeMembership
ALTER TABLE "PracticeMembership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_tenant_policy ON "PracticeMembership";
CREATE POLICY membership_tenant_policy ON "PracticeMembership"
  FOR ALL TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR "userId" = public.current_app_user_id()
    OR public.is_system_worker()
  )
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
    OR public.is_system_worker()
    OR "userId" = public.current_app_user_id()
  );

-- PatientEncounterBilling
ALTER TABLE "PatientEncounterBilling" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_tenant_policy ON "PatientEncounterBilling";
CREATE POLICY billing_tenant_policy ON "PatientEncounterBilling"
  FOR ALL TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR public.is_system_worker()
  )
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
    OR public.is_system_worker()
  );

-- ConsultationTemplate
ALTER TABLE "ConsultationTemplate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS template_tenant_policy ON "ConsultationTemplate";
CREATE POLICY template_tenant_policy ON "ConsultationTemplate"
  FOR ALL TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR public.is_system_worker()
  )
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
    OR public.is_system_worker()
  );

-- HealthObservation
ALTER TABLE "HealthObservation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS observation_patient_policy ON "HealthObservation";
CREATE POLICY observation_patient_policy ON "HealthObservation"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR public.is_system_worker()
  );

-- ConsultationNote
ALTER TABLE "ConsultationNote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consultation_note_policy ON "ConsultationNote";
CREATE POLICY consultation_note_policy ON "ConsultationNote"
  FOR ALL TO aarogyadamu_app
  USING (
    "clinicianId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_user_id() AND ("sharedWithPatient" = true OR "status" = 'APPROVED'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "clinicianId" = public.current_app_user_id()
    OR public.is_system_worker()
  );

-- ConsultationPrescriptionItem
ALTER TABLE "ConsultationPrescriptionItem" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prescription_item_policy ON "ConsultationPrescriptionItem";
CREATE POLICY prescription_item_policy ON "ConsultationPrescriptionItem"
  FOR ALL TO aarogyadamu_app
  USING (
    EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "consultationNoteId")
    OR public.is_system_worker()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "consultationNoteId")
    OR public.is_system_worker()
  );

-- MedicationSchedule
ALTER TABLE "MedicationSchedule" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medication_schedule_policy ON "MedicationSchedule";
CREATE POLICY medication_schedule_policy ON "MedicationSchedule"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR public.is_system_worker()
  );

-- MedicationAdherenceEvent
ALTER TABLE "MedicationAdherenceEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS medication_adherence_policy ON "MedicationAdherenceEvent";
CREATE POLICY medication_adherence_policy ON "MedicationAdherenceEvent"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'RECORD_MEDICATION_TAKEN'))
    OR public.is_system_worker()
  );

-- CarePlan
ALTER TABLE "CarePlan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS careplan_policy ON "CarePlan";
CREATE POLICY careplan_policy ON "CarePlan"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR public.is_system_worker()
  )
  WITH CHECK (
    "doctorId" = public.current_app_user_id()
    OR public.is_system_worker()
  );

-- CarePlanGoal & Activity
ALTER TABLE "CarePlanGoal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS careplan_goal_policy ON "CarePlanGoal";
CREATE POLICY careplan_goal_policy ON "CarePlanGoal"
  FOR ALL TO aarogyadamu_app
  USING (
    EXISTS (SELECT 1 FROM "CarePlan" WHERE id = "carePlanId")
    OR public.is_system_worker()
  );

ALTER TABLE "CarePlanActivity" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS careplan_activity_policy ON "CarePlanActivity";
CREATE POLICY careplan_activity_policy ON "CarePlanActivity"
  FOR ALL TO aarogyadamu_app
  USING (
    EXISTS (SELECT 1 FROM "CarePlan" WHERE id = "carePlanId")
    OR public.is_system_worker()
  );

-- CareTask
ALTER TABLE "CareTask" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caretask_policy ON "CareTask";
CREATE POLICY caretask_policy ON "CareTask"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF'))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_TASKS'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF'))
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR public.is_system_worker()
  );

-- CaregiverConsent
ALTER TABLE "CaregiverConsent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caregiver_consent_policy ON "CaregiverConsent";
CREATE POLICY caregiver_consent_policy ON "CaregiverConsent"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "caregiverEmail" = (SELECT email FROM "User" WHERE id = public.current_app_user_id())
    OR "patientId" = public.current_app_patient_id()
    OR public.is_system_worker()
  )
  WITH CHECK (
    "patientId" = public.current_app_user_id()
    OR "caregiverEmail" = (SELECT email FROM "User" WHERE id = public.current_app_user_id())
    OR "patientId" = public.current_app_patient_id()
    OR public.is_system_worker()
  );

-- DoctorPatientAssignment
ALTER TABLE "DoctorPatientAssignment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_patient_assignment_policy ON "DoctorPatientAssignment";
CREATE POLICY doctor_patient_assignment_policy ON "DoctorPatientAssignment"
  FOR ALL TO aarogyadamu_app
  USING (
    "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR EXISTS (SELECT 1 FROM "PracticeMembership" WHERE "practiceId" = public.current_app_practice_id() AND "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  )
  WITH CHECK (
    "doctorId" = public.current_app_user_id()
    OR EXISTS (SELECT 1 FROM "PracticeMembership" WHERE "practiceId" = public.current_app_practice_id() AND "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  );

-- Appointment
ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_policy ON "Appointment";
CREATE POLICY appointment_policy ON "Appointment"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR EXISTS (SELECT 1 FROM "PracticeMembership" WHERE "practiceId" = public.current_app_practice_id() AND "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  )
  WITH CHECK (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR EXISTS (SELECT 1 FROM "PracticeMembership" WHERE "practiceId" = public.current_app_practice_id() AND "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  );

-- HealthDocument
ALTER TABLE "HealthDocument" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_document_policy ON "HealthDocument";
CREATE POLICY health_document_policy ON "HealthDocument"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR public.is_system_worker()
  );

-- LifestyleRecord
ALTER TABLE "LifestyleRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lifestyle_record_policy ON "LifestyleRecord";
CREATE POLICY lifestyle_record_policy ON "LifestyleRecord"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'))
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_system_worker()
  );

-- PatientProfile
ALTER TABLE "PatientProfile" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_profile_policy ON "PatientProfile";
CREATE POLICY patient_profile_policy ON "PatientProfile"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR "userId" = public.current_app_patient_id()
    OR EXISTS (SELECT 1 FROM "PracticeMembership" WHERE "practiceId" = public.current_app_practice_id() AND "userId" = public.current_app_user_id() AND "isActive" = true)
    OR public.is_system_worker()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_system_worker()
  );

-- User
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_read_policy ON "User";
CREATE POLICY user_read_policy ON "User" FOR SELECT TO aarogyadamu_app USING (true);
DROP POLICY IF EXISTS user_mutation_policy ON "User";
CREATE POLICY user_mutation_policy ON "User" FOR UPDATE TO aarogyadamu_app USING (id = public.current_app_user_id() OR public.is_system_worker());
DROP POLICY IF EXISTS user_insert_policy ON "User";
CREATE POLICY user_insert_policy ON "User" FOR INSERT TO aarogyadamu_app WITH CHECK (true);

-- Audit Tables (Immutable Append-only)
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_insert_policy ON "AuditLog";
CREATE POLICY audit_log_insert_policy ON "AuditLog" FOR INSERT TO aarogyadamu_app WITH CHECK (true);
DROP POLICY IF EXISTS audit_log_read_policy ON "AuditLog";
CREATE POLICY audit_log_read_policy ON "AuditLog" FOR SELECT TO aarogyadamu_app USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "SecurityAuditEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sec_audit_insert_policy ON "SecurityAuditEvent";
CREATE POLICY sec_audit_insert_policy ON "SecurityAuditEvent" FOR INSERT TO aarogyadamu_app WITH CHECK (true);
DROP POLICY IF EXISTS sec_audit_read_policy ON "SecurityAuditEvent";
CREATE POLICY sec_audit_read_policy ON "SecurityAuditEvent" FOR SELECT TO aarogyadamu_app USING (public.is_system_worker());

ALTER TABLE "AgentAuditRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_audit_insert_policy ON "AgentAuditRecord";
CREATE POLICY agent_audit_insert_policy ON "AgentAuditRecord" FOR INSERT TO aarogyadamu_app WITH CHECK (true);
DROP POLICY IF EXISTS agent_audit_read_policy ON "AgentAuditRecord";
CREATE POLICY agent_audit_read_policy ON "AgentAuditRecord" FOR SELECT TO aarogyadamu_app USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

-- Damu Conversations & Messages
ALTER TABLE "DamuConversation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS damu_conversation_policy ON "DamuConversation";
CREATE POLICY damu_conversation_policy ON "DamuConversation" FOR ALL TO aarogyadamu_app USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "DamuMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS damu_message_policy ON "DamuMessage";
CREATE POLICY damu_message_policy ON "DamuMessage" FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "DamuConversation" WHERE id = "conversationId") OR public.is_system_worker());

-- Agent Runtime
ALTER TABLE "AgentPlan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_plan_policy ON "AgentPlan";
CREATE POLICY agent_plan_policy ON "AgentPlan" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "targetPatientId" = public.current_app_user_id() OR "targetPatientId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "AgentAction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_action_policy ON "AgentAction";
CREATE POLICY agent_action_policy ON "AgentAction" FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "AgentPlan" WHERE id = "planId") OR public.is_system_worker());

ALTER TABLE "AssistantProposal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assistant_proposal_policy ON "AssistantProposal";
CREATE POLICY assistant_proposal_policy ON "AssistantProposal" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

-- Sessions & Tokens
ALTER TABLE "AuthSession" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_session_policy ON "AuthSession";
CREATE POLICY auth_session_policy ON "AuthSession" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refresh_token_policy ON "RefreshToken";
CREATE POLICY refresh_token_policy ON "RefreshToken" FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "AuthSession" WHERE id = "sessionId" AND ("userId" = public.current_app_user_id() OR public.is_system_worker())) OR public.is_system_worker());

-- Emergency & Notifications
ALTER TABLE "EmergencySosEvent" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_sos_policy ON "EmergencySosEvent";
CREATE POLICY emergency_sos_policy ON "EmergencySosEvent" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "EmergencyContact" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS emergency_contact_policy ON "EmergencyContact";
CREATE POLICY emergency_contact_policy ON "EmergencyContact" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "JourneyMilestone" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journey_milestone_policy ON "JourneyMilestone";
CREATE POLICY journey_milestone_policy ON "JourneyMilestone" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_flag_read_policy ON "FeatureFlag";
CREATE POLICY feature_flag_read_policy ON "FeatureFlag" FOR SELECT TO aarogyadamu_app USING (true);

ALTER TABLE "DoctorInvitation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_invitation_policy ON "DoctorInvitation";
CREATE POLICY doctor_invitation_policy ON "DoctorInvitation" FOR ALL TO aarogyadamu_app USING (true);

ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_policy ON "PasswordResetToken";
CREATE POLICY password_reset_policy ON "PasswordResetToken" FOR ALL TO aarogyadamu_app USING (true);

ALTER TABLE "CareNotification" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS care_notification_policy ON "CareNotification";
CREATE POLICY care_notification_policy ON "CareNotification" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "patientId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notif_pref_policy ON "NotificationPreference";
CREATE POLICY notif_pref_policy ON "NotificationPreference" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "DevicePushToken" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS device_token_policy ON "DevicePushToken";
CREATE POLICY device_token_policy ON "DevicePushToken" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker());

ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_policy ON "Reminder";
CREATE POLICY reminder_policy ON "Reminder" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "CareTeamMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS care_team_message_policy ON "CareTeamMessage";
CREATE POLICY care_team_message_policy ON "CareTeamMessage" FOR ALL TO aarogyadamu_app
  USING ("senderId" = public.current_app_user_id() OR "recipientId" = public.current_app_user_id() OR "patientId" = public.current_app_user_id() OR "patientId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "DoctorAvailability" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_avail_policy ON "DoctorAvailability";
CREATE POLICY doctor_avail_policy ON "DoctorAvailability" FOR SELECT TO aarogyadamu_app USING (true);

ALTER TABLE "DoctorTimeOff" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doctor_time_off_policy ON "DoctorTimeOff";
CREATE POLICY doctor_time_off_policy ON "DoctorTimeOff" FOR SELECT TO aarogyadamu_app USING (true);

ALTER TABLE "ConsultationPrep" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consultation_prep_policy ON "ConsultationPrep";
CREATE POLICY consultation_prep_policy ON "ConsultationPrep" FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id() OR public.is_system_worker());

ALTER TABLE "ConsultationNoteVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consultation_note_version_policy ON "ConsultationNoteVersion";
CREATE POLICY consultation_note_version_policy ON "ConsultationNoteVersion" FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "noteId") OR public.is_system_worker());

