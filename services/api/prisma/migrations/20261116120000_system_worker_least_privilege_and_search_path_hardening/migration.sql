-- Migration: 20261116120000_system_worker_least_privilege_and_search_path_hardening
-- Purpose: Permanently eliminates generic system-worker bypass, hardens SECURITY DEFINER search paths to pg_catalog, pg_temp,
--          revokes PUBLIC execution privileges, enforces zero worker bypass on clinical data, and scopes worker identities.

-- 1. Cryptographic Vault Schema & Key Table
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS _security_vault;

CREATE TABLE IF NOT EXISTS _security_vault.rls_signing_key (
  key_id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default secure fallback key (overwritten by local environment provisioning)
INSERT INTO _security_vault.rls_signing_key (key_id, secret)
VALUES ('active-key', 'aarogya_rls_signing_secret_super_secure_2026_production_key_minimum_32_chars')
ON CONFLICT (key_id) DO NOTHING;

REVOKE ALL ON SCHEMA _security_vault FROM PUBLIC, aarogyadamu_app;
REVOKE ALL ON TABLE _security_vault.rls_signing_key FROM PUBLIC, aarogyadamu_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_dev') THEN
    GRANT USAGE ON SCHEMA _security_vault TO aarogyadamu_dev;
    GRANT ALL ON TABLE _security_vault.rls_signing_key TO aarogyadamu_dev;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT USAGE ON SCHEMA _security_vault TO aarogyadamu_migrator;
    GRANT ALL ON TABLE _security_vault.rls_signing_key TO aarogyadamu_migrator;
  END IF;
END
$$;

-- 2. Hardened Verification Routine (_verify_and_get_context)
CREATE OR REPLACE FUNCTION public._verify_and_get_context(p_field TEXT) RETURNS TEXT AS $$
DECLARE
  v_payload TEXT;
  v_sig TEXT;
  v_secret TEXT;
  v_expected_sig TEXT;
  v_parts TEXT[];
  v_version TEXT;
  v_practice_id TEXT;
  v_user_id TEXT;
  v_role TEXT;
  v_patient_id TEXT;
  v_is_worker TEXT;
  v_iat BIGINT;
  v_exp BIGINT;
  v_signed_xid TEXT;
  v_signed_pid INT;
  v_now BIGINT;
  v_current_xid TEXT;
  v_current_pid INT;
BEGIN
  -- 1. Retrieve session-local GUC settings (fail-closed if absent)
  v_payload := NULLIF(current_setting('app.context_payload', true), '');
  v_sig := NULLIF(current_setting('app.context_signature', true), '');
  IF v_payload IS NULL OR v_sig IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2. Retrieve active master HMAC signing secret from isolated vault
  SELECT secret INTO v_secret 
  FROM _security_vault.rls_signing_key 
  WHERE key_id = 'active-key';
  
  IF v_secret IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Verify cryptographic HMAC-SHA256 signature
  v_expected_sig := encode(public.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_expected_sig != v_sig THEN
    RETURN NULL; -- Signature mismatch: rejected!
  END IF;

  -- 4. Parse canonical payload fields:
  --    Format: v2|practiceId|userId|role|patientId|isSystemWorker|iat|exp|xid|pid
  v_parts := string_to_array(v_payload, '|');
  IF array_length(v_parts, 1) < 10 THEN
    RETURN NULL; -- Malformed payload
  END IF;

  v_version := v_parts[1];
  IF v_version != 'v2' THEN
    RETURN NULL; -- Unsupported version
  END IF;

  v_practice_id := NULLIF(v_parts[2], '');
  v_user_id := NULLIF(v_parts[3], '');
  v_role := NULLIF(v_parts[4], '');
  v_patient_id := NULLIF(v_parts[5], '');
  v_is_worker := v_parts[6];
  v_iat := v_parts[7]::bigint;
  v_exp := v_parts[8]::bigint;
  v_signed_xid := v_parts[9];
  v_signed_pid := v_parts[10]::integer;

  -- 5. Temporal validation
  v_now := extract(epoch from clock_timestamp())::bigint;
  IF v_iat > (v_now + 10) THEN
    RETURN NULL; -- Future timestamp / clock skew violation
  END IF;
  IF v_exp < v_now THEN
    RETURN NULL; -- Expired context
  END IF;

  -- 6. Anti-Replay: Transaction ID Verification
  v_current_xid := pg_current_xact_id()::text;
  IF v_signed_xid != v_current_xid THEN
    RETURN NULL; -- REPLAY REJECTED: Transaction ID mismatch
  END IF;

  -- 7. Anti-Replay: Backend Connection PID Verification
  v_current_pid := pg_backend_pid();
  IF v_signed_pid != v_current_pid THEN
    RETURN NULL; -- REPLAY REJECTED: Connection PID mismatch
  END IF;

  -- 8. Validated field extraction
  IF p_field = 'practice_id' THEN RETURN v_practice_id;
  ELSIF p_field = 'user_id' THEN RETURN v_user_id;
  ELSIF p_field = 'role' THEN RETURN v_role;
  ELSIF p_field = 'patient_id' THEN RETURN v_patient_id;
  ELSIF p_field = 'is_system_worker' THEN RETURN v_is_worker;
  ELSE RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, _security_vault, pg_temp;

REVOKE EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) TO aarogyadamu_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;

-- 3. Hardened System Worker Verification Routine
-- Drop legacy 0-argument function to eliminate overload ambiguity and universal bypass
DROP FUNCTION IF EXISTS public.is_system_worker() CASCADE;

CREATE OR REPLACE FUNCTION public.is_system_worker(
  p_scope TEXT DEFAULT NULL::text
)
RETURNS BOOLEAN AS $$
DECLARE
  v_val TEXT;
BEGIN
  -- Strict fail-closed: scope argument MUST be provided, non-empty, and non-whitespace.
  IF p_scope IS NULL OR btrim(p_scope) = '' THEN
    RETURN FALSE;
  END IF;

  v_val := public._verify_and_get_context('is_system_worker');

  -- Strict rejection: null, empty, false, and generic 'true' bypass are strictly FALSE.
  IF v_val IS NULL OR btrim(v_val) = '' OR v_val = 'false' OR v_val = 'true' THEN
    RETURN FALSE;
  END IF;

  -- Exact scope match required: identity spoofing across worker roles is blocked.
  RETURN (v_val = p_scope);
END;
$$ LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_system_worker(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_system_worker(TEXT) TO aarogyadamu_app;

-- 4. Context Extraction Helpers with Hardened search_path = pg_catalog, pg_temp
CREATE OR REPLACE FUNCTION public.current_app_practice_id() RETURNS TEXT AS $$
  SELECT public._verify_and_get_context('practice_id');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION public.current_app_user_id() RETURNS TEXT AS $$
  SELECT public._verify_and_get_context('user_id');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION public.current_app_patient_id() RETURNS TEXT AS $$
  SELECT public._verify_and_get_context('patient_id');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS TEXT AS $$
  SELECT public._verify_and_get_context('role');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_app_practice_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_practice_id() TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.current_app_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.current_app_patient_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_patient_id() TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.current_app_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO aarogyadamu_app;

-- 5. Relationship Helpers with Hardened search_path = pg_catalog, public, pg_temp
CREATE OR REPLACE FUNCTION public.is_doctor_assigned_to_patient(p_doc TEXT, p_patient TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "DoctorPatientAssignment"
    WHERE "doctorId" = p_doc AND "patientId" = p_patient AND "status" = 'ACTIVE'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.has_caregiver_consent(p_caregiver_user TEXT, p_patient TEXT, p_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM "CaregiverConsent" cc
    JOIN "User" u ON u.email = cc."caregiverEmail"
    WHERE u.id = p_caregiver_user 
      AND cc."patientId" = p_patient 
      AND cc."status" = 'ACTIVE' 
      AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
      AND (p_permission IS NULL OR cc."permissions" LIKE '%' || p_permission || '%')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public.is_system_worker(TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_practice_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_patient_id() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_role() TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;

-- 6. Modernized RLS Policies Across All 45 Application Tables

-- AgentAction (Zero Worker Bypass)
DROP POLICY IF EXISTS agent_action_policy ON "AgentAction";
CREATE POLICY agent_action_policy ON "AgentAction"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "AgentPlan" WHERE id = "planId"));

-- AgentAuditRecord (Zero Worker Bypass)
DROP POLICY IF EXISTS agent_audit_read_policy ON "AgentAuditRecord";
CREATE POLICY agent_audit_read_policy ON "AgentAuditRecord"
  FOR SELECT TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id());

-- AgentPlan (Zero Worker Bypass)
DROP POLICY IF EXISTS agent_plan_policy ON "AgentPlan";
CREATE POLICY agent_plan_policy ON "AgentPlan"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "targetPatientId" = public.current_app_user_id() OR "targetPatientId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id());

-- Appointment (Zero Worker Bypass)
DROP POLICY IF EXISTS appointment_policy ON "Appointment";
CREATE POLICY appointment_policy ON "Appointment"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR (EXISTS (
      SELECT 1 FROM "PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
  )
  WITH CHECK (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR (EXISTS (
      SELECT 1 FROM "PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
  );

-- AssistantProposal (Zero Worker Bypass)
DROP POLICY IF EXISTS assistant_proposal_policy ON "AssistantProposal";
CREATE POLICY assistant_proposal_policy ON "AssistantProposal"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

-- AuthSession (SESSION_WORKER, REGISTRATION_WORKER, INVITATION_WORKER)
DROP POLICY IF EXISTS auth_session_policy ON "AuthSession";
CREATE POLICY auth_session_policy ON "AuthSession"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_system_worker('SESSION_WORKER')
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_system_worker('SESSION_WORKER')
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
  );

-- CareNotification (Zero Worker Bypass)
DROP POLICY IF EXISTS care_notification_policy ON "CareNotification";
CREATE POLICY care_notification_policy ON "CareNotification"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
  );

-- CarePlan (Zero Worker Bypass)
DROP POLICY IF EXISTS careplan_policy ON "CarePlan";
CREATE POLICY careplan_policy ON "CarePlan"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
  )
  WITH CHECK ("doctorId" = public.current_app_user_id());

-- CarePlanActivity (Zero Worker Bypass)
DROP POLICY IF EXISTS careplan_activity_policy ON "CarePlanActivity";
CREATE POLICY careplan_activity_policy ON "CarePlanActivity"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "CarePlan" WHERE id = "carePlanId"));

-- CarePlanGoal (Zero Worker Bypass)
DROP POLICY IF EXISTS careplan_goal_policy ON "CarePlanGoal";
CREATE POLICY careplan_goal_policy ON "CarePlanGoal"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "CarePlan" WHERE id = "carePlanId"));

-- CareTask (Zero Worker Bypass)
DROP POLICY IF EXISTS caretask_policy ON "CareTask";
CREATE POLICY caretask_policy ON "CareTask"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF'::text))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_TASKS'::text))
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF'::text))
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
  );

-- CareTeamMessage (Zero Worker Bypass)
DROP POLICY IF EXISTS care_team_message_policy ON "CareTeamMessage";
CREATE POLICY care_team_message_policy ON "CareTeamMessage"
  FOR ALL TO aarogyadamu_app
  USING (
    "senderId" = public.current_app_user_id()
    OR "recipientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
  )
  WITH CHECK ("senderId" = public.current_app_user_id());

-- CaregiverConsent (Zero Worker Bypass)
DROP POLICY IF EXISTS caregiver_consent_policy ON "CaregiverConsent";
CREATE POLICY caregiver_consent_policy ON "CaregiverConsent"
  FOR ALL TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "caregiverEmail" = (SELECT "User".email FROM "User" WHERE "User".id = public.current_app_user_id())
    OR "patientId" = public.current_app_patient_id()
  )
  WITH CHECK (
    "patientId" = public.current_app_user_id()
    OR "caregiverEmail" = (SELECT "User".email FROM "User" WHERE "User".id = public.current_app_user_id())
    OR "patientId" = public.current_app_patient_id()
  );

-- ConsultationNote (Zero Worker Bypass)
DROP POLICY IF EXISTS consultation_note_policy ON "ConsultationNote";
CREATE POLICY consultation_note_policy ON "ConsultationNote"
  FOR ALL TO aarogyadamu_app
  USING (
    "clinicianId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_user_id() AND ("sharedWithPatient" = true OR status = 'APPROVED'::text))
  )
  WITH CHECK ("clinicianId" = public.current_app_user_id());

-- ConsultationNoteVersion (Zero Worker Bypass)
DROP POLICY IF EXISTS consultation_note_version_policy ON "ConsultationNoteVersion";
CREATE POLICY consultation_note_version_policy ON "ConsultationNoteVersion"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "noteId"));

-- ConsultationPrep (Zero Worker Bypass)
DROP POLICY IF EXISTS consultation_prep_policy ON "ConsultationPrep";
CREATE POLICY consultation_prep_policy ON "ConsultationPrep"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- ConsultationPrescriptionItem (Zero Worker Bypass)
DROP POLICY IF EXISTS prescription_item_policy ON "ConsultationPrescriptionItem";
CREATE POLICY prescription_item_policy ON "ConsultationPrescriptionItem"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "consultationNoteId"))
  WITH CHECK (EXISTS (SELECT 1 FROM "ConsultationNote" WHERE id = "consultationNoteId"));

-- ConsultationTemplate (Zero Worker Bypass)
DROP POLICY IF EXISTS template_tenant_policy ON "ConsultationTemplate";
CREATE POLICY template_tenant_policy ON "ConsultationTemplate"
  FOR ALL TO aarogyadamu_app
  USING ("practiceId" = public.current_app_practice_id())
  WITH CHECK ("practiceId" = public.current_app_practice_id());

-- DamuConversation (Zero Worker Bypass)
DROP POLICY IF EXISTS damu_conversation_policy ON "DamuConversation";
CREATE POLICY damu_conversation_policy ON "DamuConversation"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- DamuMessage (Zero Worker Bypass)
DROP POLICY IF EXISTS damu_message_policy ON "DamuMessage";
CREATE POLICY damu_message_policy ON "DamuMessage"
  FOR ALL TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM "DamuConversation" WHERE id = "conversationId"));

-- DevicePushToken (Zero Worker Bypass)
DROP POLICY IF EXISTS device_token_policy ON "DevicePushToken";
CREATE POLICY device_token_policy ON "DevicePushToken"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

-- DoctorAvailability (Public read for patient booking)
DROP POLICY IF EXISTS doctor_avail_policy ON "DoctorAvailability";
CREATE POLICY doctor_avail_policy ON "DoctorAvailability"
  FOR SELECT TO aarogyadamu_app
  USING (true);

-- DoctorInvitation (INVITATION_WORKER only)
DROP POLICY IF EXISTS doctor_invitation_policy ON "DoctorInvitation";
DROP POLICY IF EXISTS invitation_tenant_policy ON "DoctorInvitation";
CREATE POLICY doctor_invitation_policy ON "DoctorInvitation"
  FOR ALL TO aarogyadamu_app
  USING (public.is_system_worker('INVITATION_WORKER'))
  WITH CHECK (public.is_system_worker('INVITATION_WORKER'));

-- DoctorPatientAssignment (Zero Worker Bypass)
DROP POLICY IF EXISTS assignment_policy ON "DoctorPatientAssignment";
DROP POLICY IF EXISTS doctor_patient_assignment_policy ON "DoctorPatientAssignment";
CREATE POLICY assignment_policy ON "DoctorPatientAssignment"
  FOR ALL TO aarogyadamu_app
  USING (
    "doctorId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
    OR (EXISTS (
      SELECT 1 FROM "PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
  )
  WITH CHECK (
    "doctorId" = public.current_app_user_id()
    OR (EXISTS (
      SELECT 1 FROM "PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
  );

-- DoctorTimeOff (Public read)
DROP POLICY IF EXISTS doctor_time_off_policy ON "DoctorTimeOff";
CREATE POLICY doctor_time_off_policy ON "DoctorTimeOff"
  FOR SELECT TO aarogyadamu_app
  USING (true);

-- EmergencyContact (Zero Worker Bypass)
DROP POLICY IF EXISTS emergency_contact_policy ON "EmergencyContact";
CREATE POLICY emergency_contact_policy ON "EmergencyContact"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- EmergencySosEvent (Zero Worker Bypass)
DROP POLICY IF EXISTS emergency_sos_policy ON "EmergencySosEvent";
CREATE POLICY emergency_sos_policy ON "EmergencySosEvent"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- FeatureFlag (Public read)
DROP POLICY IF EXISTS feature_flag_read_policy ON "FeatureFlag";
CREATE POLICY feature_flag_read_policy ON "FeatureFlag"
  FOR SELECT TO aarogyadamu_app
  USING (true);

-- HealthDocument (Zero Worker Bypass)
DROP POLICY IF EXISTS health_document_policy ON "HealthDocument";
CREATE POLICY health_document_policy ON "HealthDocument"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'::text))
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
  );

-- HealthObservation (Zero Worker Bypass - CLINICAL_MAINTENANCE ELIMINATED)
DROP POLICY IF EXISTS observation_patient_policy ON "HealthObservation";
CREATE POLICY observation_patient_policy ON "HealthObservation"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'::text))
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- JourneyMilestone (Zero Worker Bypass)
DROP POLICY IF EXISTS journey_milestone_policy ON "JourneyMilestone";
CREATE POLICY journey_milestone_policy ON "JourneyMilestone"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- LifestyleRecord (Zero Worker Bypass)
DROP POLICY IF EXISTS lifestyle_record_policy ON "LifestyleRecord";
CREATE POLICY lifestyle_record_policy ON "LifestyleRecord"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'::text))
  )
  WITH CHECK ("userId" = public.current_app_user_id());

-- MedicationAdherenceEvent (Zero Worker Bypass)
DROP POLICY IF EXISTS medication_adherence_policy ON "MedicationAdherenceEvent";
CREATE POLICY medication_adherence_policy ON "MedicationAdherenceEvent"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId"))
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS'::text))
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'RECORD_MEDICATION_TAKEN'::text))
  );

-- MedicationSchedule (Zero Worker Bypass)
DROP POLICY IF EXISTS medication_schedule_policy ON "MedicationSchedule";
CREATE POLICY medication_schedule_policy ON "MedicationSchedule"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR ("userId" = public.current_app_patient_id() AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS'::text))
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- NotificationPreference (Zero Worker Bypass)
DROP POLICY IF EXISTS notif_pref_policy ON "NotificationPreference";
CREATE POLICY notif_pref_policy ON "NotificationPreference"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

-- PasswordResetToken (Public token check)
DROP POLICY IF EXISTS password_reset_policy ON "PasswordResetToken";
CREATE POLICY password_reset_policy ON "PasswordResetToken"
  FOR ALL TO aarogyadamu_app
  USING (true);

-- PatientEncounterBilling (Zero Worker Bypass)
DROP POLICY IF EXISTS billing_tenant_policy ON "PatientEncounterBilling";
CREATE POLICY billing_tenant_policy ON "PatientEncounterBilling"
  FOR ALL TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR "patientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_patient_id()
  )
  WITH CHECK ("practiceId" = public.current_app_practice_id());

-- PatientProfile (REGISTRATION_WORKER, INVITATION_WORKER, DEMO_WORKER)
DROP POLICY IF EXISTS patient_profile_policy ON "PatientProfile";
CREATE POLICY patient_profile_policy ON "PatientProfile"
  FOR ALL TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR "userId" = public.current_app_patient_id()
    OR (EXISTS (
      SELECT 1 FROM "PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
  );

-- Practice (INVITATION_WORKER, DEMO_WORKER)
DROP POLICY IF EXISTS practice_tenant_policy ON "Practice";
CREATE POLICY practice_tenant_policy ON "Practice"
  FOR ALL TO aarogyadamu_app
  USING (
    id = public.current_app_practice_id()
    OR id IN (
      SELECT "PracticeMembership"."practiceId" FROM "PracticeMembership"
      WHERE "PracticeMembership"."userId" = public.current_app_user_id() AND "PracticeMembership"."isActive" = true
    )
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
  )
  WITH CHECK (
    id = public.current_app_practice_id()
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
    OR (public.current_app_user_id() IS NOT NULL)
  );

-- PracticeMembership (INVITATION_WORKER, DEMO_WORKER)
DROP POLICY IF EXISTS membership_tenant_policy ON "PracticeMembership";
CREATE POLICY membership_tenant_policy ON "PracticeMembership"
  FOR ALL TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR "userId" = public.current_app_user_id()
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
  )
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
    OR ("userId" = public.current_app_user_id())
  );

-- RefreshToken (SESSION_WORKER, REGISTRATION_WORKER, INVITATION_WORKER)
DROP POLICY IF EXISTS refresh_token_policy ON "RefreshToken";
CREATE POLICY refresh_token_policy ON "RefreshToken"
  FOR ALL TO aarogyadamu_app
  USING (
    (EXISTS (
      SELECT 1 FROM "AuthSession"
      WHERE "AuthSession".id = "RefreshToken"."sessionId"
        AND (
          "AuthSession"."userId" = public.current_app_user_id()
          OR public.is_system_worker('SESSION_WORKER')
          OR public.is_system_worker('REGISTRATION_WORKER')
          OR public.is_system_worker('INVITATION_WORKER')
        )
    ))
    OR public.is_system_worker('SESSION_WORKER')
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
  )
  WITH CHECK (
    public.is_system_worker('SESSION_WORKER')
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
    OR (EXISTS (
      SELECT 1 FROM "AuthSession"
      WHERE "AuthSession".id = "RefreshToken"."sessionId"
        AND "AuthSession"."userId" = public.current_app_user_id()
    ))
  );

-- Reminder (Zero Worker Bypass)
DROP POLICY IF EXISTS reminder_policy ON "Reminder";
CREATE POLICY reminder_policy ON "Reminder"
  FOR ALL TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id())
  WITH CHECK ("userId" = public.current_app_user_id() OR "userId" = public.current_app_patient_id());

-- User mutation (UPDATE) (REGISTRATION_WORKER, INVITATION_WORKER, DEMO_WORKER, SESSION_WORKER)
DROP POLICY IF EXISTS user_mutation_policy ON "User";
CREATE POLICY user_mutation_policy ON "User"
  FOR UPDATE TO aarogyadamu_app
  USING (
    id = public.current_app_user_id()
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
    OR public.is_system_worker('SESSION_WORKER')
  )
  WITH CHECK (
    id = public.current_app_user_id()
    OR public.is_system_worker('REGISTRATION_WORKER')
    OR public.is_system_worker('INVITATION_WORKER')
    OR public.is_system_worker('DEMO_WORKER')
    OR public.is_system_worker('SESSION_WORKER')
  );

-- SecurityAuditEvent (Strictly SECURITY_RECORDER)
DROP POLICY IF EXISTS sec_audit_insert_policy ON "SecurityAuditEvent";
DROP POLICY IF EXISTS sec_audit_read_policy ON "SecurityAuditEvent";
CREATE POLICY sec_audit_insert_policy ON "SecurityAuditEvent" 
  FOR INSERT TO aarogyadamu_app 
  WITH CHECK (public.is_system_worker('SECURITY_RECORDER'));
CREATE POLICY sec_audit_read_policy ON "SecurityAuditEvent" 
  FOR SELECT TO aarogyadamu_app 
  USING (public.is_system_worker('SECURITY_RECORDER'));

-- AuditLog (Strictly AUDIT_RECORDER)
DROP POLICY IF EXISTS audit_log_insert_policy ON "AuditLog";
DROP POLICY IF EXISTS audit_log_read_policy ON "AuditLog";
CREATE POLICY audit_log_insert_policy ON "AuditLog" 
  FOR INSERT TO aarogyadamu_app 
  WITH CHECK (public.is_system_worker('AUDIT_RECORDER'));
CREATE POLICY audit_log_read_policy ON "AuditLog" 
  FOR SELECT TO aarogyadamu_app 
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker('AUDIT_RECORDER'));

-- 7. Internal Migration Table Protection
REVOKE ALL ON TABLE "_prisma_migrations" FROM aarogyadamu_app;
