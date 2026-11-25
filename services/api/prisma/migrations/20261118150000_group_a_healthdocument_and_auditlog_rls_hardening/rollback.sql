-- Rollback Migration: 20261118150000_group_a_healthdocument_and_auditlog_rls_hardening
-- Purpose: Restores exact pre-migration PostgreSQL RLS policies, trigger state, helper functions, and table ACLs
-- Target: Returns database to pre-Group-A state (defined by 20261116120000 and 20261116160000)
-- DO NOT EXECUTE AUTOMATICALLY. Transactional rollback script.

BEGIN;

-- ============================================================================
-- 1. DROP GROUP A TRIGGERS AND FUNCTIONS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_healthdocument_columns ON public."HealthDocument";
DROP FUNCTION IF EXISTS public.trg_healthdocument_column_guard();

DROP TRIGGER IF EXISTS trg_user_columns ON public."User";
DROP FUNCTION IF EXISTS public.trg_user_column_guard();

DROP FUNCTION IF EXISTS public.is_patient_in_bulk_allowlist(TEXT);
DROP FUNCTION IF EXISTS public.current_app_audit_event_id();

-- Restore original 10-part _verify_and_get_context from migration 20261116120000
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
  v_payload := NULLIF(current_setting('app.context_payload', true), '');
  v_sig := NULLIF(current_setting('app.context_signature', true), '');
  IF v_payload IS NULL OR v_sig IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT secret INTO v_secret 
  FROM _security_vault.rls_signing_key 
  WHERE key_id = 'active-key';
  
  IF v_secret IS NULL THEN
    RETURN NULL;
  END IF;

  v_expected_sig := encode(public.hmac(v_payload::bytea, v_secret::bytea, 'sha256'), 'hex');
  IF v_expected_sig != v_sig THEN
    RETURN NULL;
  END IF;

  v_parts := string_to_array(v_payload, '|');
  IF array_length(v_parts, 1) < 10 THEN
    RETURN NULL;
  END IF;

  v_version := v_parts[1];
  IF v_version != 'v2' THEN
    RETURN NULL;
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

  v_now := extract(epoch from clock_timestamp())::bigint;
  IF v_iat > (v_now + 10) THEN
    RETURN NULL;
  END IF;
  IF v_exp < v_now THEN
    RETURN NULL;
  END IF;

  v_current_xid := pg_current_xact_id()::text;
  IF v_signed_xid != v_current_xid THEN
    RETURN NULL;
  END IF;

  v_current_pid := pg_backend_pid();
  IF v_signed_pid != v_current_pid THEN
    RETURN NULL;
  END IF;

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
GRANT EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) TO aarogyadamu_app, aarogyadamu_migrator;

-- ============================================================================
-- 2. DROP GROUP A POLICIES
-- ============================================================================

DROP POLICY IF EXISTS doc_insert_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_select_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_update_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_delete_policy ON public."HealthDocument";

DROP POLICY IF EXISTS audit_log_insert_policy ON public."AuditLog";
DROP POLICY IF EXISTS audit_log_read_policy ON public."AuditLog";

DROP POLICY IF EXISTS user_mutation_policy ON public."User";

-- ============================================================================
-- 3. RESTORE PREVIOUS USER MUTATION POLICY (from migration 20261116120000)
-- ============================================================================

CREATE POLICY user_mutation_policy ON public."User"
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

-- ============================================================================
-- 4. RESTORE PREVIOUS HEALTHDOCUMENT POLICIES (from migration 20261116160000)
-- ============================================================================

CREATE POLICY doc_select_policy ON public."HealthDocument"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'::text)
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_DOCUMENTS'::text)
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_REPORTS'::text)
      )
    )
  );

CREATE POLICY doc_insert_policy ON public."HealthDocument"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY doc_update_policy ON public."HealthDocument"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY doc_delete_policy ON public."HealthDocument"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- ============================================================================
-- 5. RESTORE PREVIOUS AUDITLOG POLICIES (from migration 20261116120000)
-- ============================================================================

CREATE POLICY audit_log_insert_policy ON public."AuditLog" 
  FOR INSERT TO aarogyadamu_app 
  WITH CHECK (public.is_system_worker('AUDIT_RECORDER'::text));

CREATE POLICY audit_log_read_policy ON public."AuditLog" 
  FOR SELECT TO aarogyadamu_app 
  USING ("userId" = public.current_app_user_id() OR public.is_system_worker('AUDIT_RECORDER'::text));

-- ============================================================================
-- 6. RESTORE PREVIOUS TABLE PRIVILEGES (ALL TABLES grant from 20261115160000)
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public."AuditLog" TO aarogyadamu_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public."HealthDocument" TO aarogyadamu_app;

COMMIT;
