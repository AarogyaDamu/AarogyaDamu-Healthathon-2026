-- Migration: 20261118150000_group_a_healthdocument_and_auditlog_rls_hardening
-- Purpose: Remediate HealthDocument and AuditLog PostgreSQL RLS INSERT rejections (42501),
--          enforce strict User.isSyntheticDemo immutability and approved staging bootstrap scope,
--          implement dedicated signed patient allowlist helper for DEMO_WORKER_BULK_SEED (zero update/delete),
--          and implement exact single-row read-back for background AUDIT_RECORDER via cryptographically bound event ID.
-- Scope: Least-privilege command-specific policies, column guard triggers, and immutability for role 'aarogyadamu_app'
-- DO NOT EXECUTE AUTOMATICALLY. Prepared forward-only migration.

BEGIN;

-- ============================================================================
-- 1. DROP EXISTING POLICIES AND TRIGGERS (Idempotency)
-- ============================================================================

DROP POLICY IF EXISTS health_document_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_insert_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_select_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_update_policy ON public."HealthDocument";
DROP POLICY IF EXISTS doc_delete_policy ON public."HealthDocument";

DROP POLICY IF EXISTS audit_log_insert_policy ON public."AuditLog";
DROP POLICY IF EXISTS audit_log_read_policy ON public."AuditLog";

DROP TRIGGER IF EXISTS trg_healthdocument_columns ON public."HealthDocument";
DROP FUNCTION IF EXISTS public.trg_healthdocument_column_guard();

DROP TRIGGER IF EXISTS trg_user_columns ON public."User";
DROP FUNCTION IF EXISTS public.trg_user_column_guard();
DROP POLICY IF EXISTS user_mutation_policy ON public."User";

DROP FUNCTION IF EXISTS public.is_patient_in_bulk_allowlist(TEXT);
DROP FUNCTION IF EXISTS public.current_app_audit_event_id();

-- ============================================================================
-- 2. USER TABLE HARDENING & IMMUTABILITY (Protects isSyntheticDemo from ordinary workers & users)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_user_column_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- Strict protection for isSyntheticDemo marker:
  -- Ordinary users, clinicians, caregivers, and ordinary DEMO_WORKER cannot alter synthetic status.
  -- Only dedicated administrative bootstrap worker (STAGING_BOOTSTRAP_WORKER) is permitted to modify this marker.
  IF OLD."isSyntheticDemo" IS DISTINCT FROM NEW."isSyntheticDemo" THEN
    IF NOT public.is_system_worker('STAGING_BOOTSTRAP_WORKER'::text) THEN
      RAISE EXCEPTION 'Privilege violation: unauthorized mutation of User.isSyntheticDemo'
        USING ERRCODE = '42501';
    END IF;

    -- Restrict bootstrap operations to explicitly approved synthetic accounts:
    -- Cannot set isSyntheticDemo on accounts with real domain names (must match approved synthetic domain, family/staging subdomains, or demo prefix)
    IF NEW."email" NOT LIKE '%@aarogyadamu.local'
       AND NEW."email" NOT LIKE '%@family.aarogyadamu.local'
       AND NEW."email" NOT LIKE '%@staging.aarogyadamu.local'
       AND NEW."email" NOT LIKE 'demo.%@%' THEN
      RAISE EXCEPTION 'Security violation: STAGING_BOOTSTRAP_WORKER cannot mark non-approved account as synthetic'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp;

CREATE TRIGGER trg_user_columns
  BEFORE UPDATE ON public."User"
  FOR EACH ROW EXECUTE FUNCTION public.trg_user_column_guard();

CREATE POLICY user_mutation_policy ON public."User"
  FOR UPDATE TO aarogyadamu_app
  USING (
    id = public.current_app_user_id()
    OR public.is_system_worker('REGISTRATION_WORKER'::text)
    OR public.is_system_worker('INVITATION_WORKER'::text)
    OR public.is_system_worker('SESSION_WORKER'::text)
    OR (public.is_system_worker('DEMO_WORKER'::text) AND "isSyntheticDemo" = true)
    OR public.is_system_worker('STAGING_BOOTSTRAP_WORKER'::text)
  )
  WITH CHECK (
    id = public.current_app_user_id()
    OR public.is_system_worker('REGISTRATION_WORKER'::text)
    OR public.is_system_worker('INVITATION_WORKER'::text)
    OR public.is_system_worker('SESSION_WORKER'::text)
    OR (public.is_system_worker('DEMO_WORKER'::text) AND "isSyntheticDemo" = true)
    OR public.is_system_worker('STAGING_BOOTSTRAP_WORKER'::text)
  );

-- ============================================================================
-- 3. HEALTHDOCUMENT COLUMN GUARD TRIGGER (Enforces Absolute Ownership & Provenance Immutability)
-- Note: SECURITY INVOKER (default) - executes with the caller's privileges.
-- Group B separation preserved: does not modify SECURITY DEFINER functions or ownership.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_healthdocument_column_guard()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Identity immutability
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Identity violation: cannot mutate HealthDocument primary key'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Strict patient ownership immutability (permanently blocks cross-patient document reassignment)
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot reassign HealthDocument patient ownership'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Audit creation timestamp immutability
  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot mutate HealthDocument creation timestamp'
      USING ERRCODE = '42501';
  END IF;

  -- 4. File storage path immutability once assigned (preserves legitimate first-time assignment)
  IF OLD."storagePath" IS NOT NULL AND NEW."storagePath" IS DISTINCT FROM OLD."storagePath" THEN
    RAISE EXCEPTION 'Integrity violation: cannot mutate immutable document storage path'
      USING ERRCODE = '42501';
  END IF;

  -- 5. File size metric immutability once assigned (preserves legitimate first-time assignment)
  IF OLD."fileSizeBytes" IS NOT NULL AND NEW."fileSizeBytes" IS DISTINCT FROM OLD."fileSizeBytes" THEN
    RAISE EXCEPTION 'Integrity violation: cannot mutate immutable document file size'
      USING ERRCODE = '42501';
  END IF;

  -- 6. MIME type immutability once assigned (preserves legitimate first-time assignment)
  IF OLD."mimeType" IS NOT NULL AND NEW."mimeType" IS DISTINCT FROM OLD."mimeType" THEN
    RAISE EXCEPTION 'Integrity violation: cannot mutate immutable document mime type'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp;

CREATE TRIGGER trg_healthdocument_columns
  BEFORE UPDATE ON public."HealthDocument"
  FOR EACH ROW EXECUTE FUNCTION public.trg_healthdocument_column_guard();

-- ============================================================================
-- 4. DEDICATED BULK PATIENT ALLOWLIST & EXACT AUDIT EVENT HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_patient_in_bulk_allowlist(p_target_patient TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_raw_claim TEXT;
  v_clean_claim TEXT;
  v_ids TEXT[];
  v_id TEXT;
  v_count INT;
  v_distinct_count INT;
  v_valid_synthetic_count INT;
BEGIN
  -- 1. Must be verified DEMO_WORKER_BULK_SEED worker
  IF NOT public.is_system_worker('DEMO_WORKER_BULK_SEED'::text) THEN
    RETURN FALSE;
  END IF;

  -- 2. Target patient must be non-empty
  IF p_target_patient IS NULL OR trim(p_target_patient) = '' THEN
    RETURN FALSE;
  END IF;

  -- 3. Retrieve signed patient claim from cryptographically verified context
  v_raw_claim := public.current_app_patient_id();
  IF v_raw_claim IS NULL OR trim(v_raw_claim) = '' THEN
    RETURN FALSE;
  END IF;

  -- Strip optional 'ALLOWLIST:' prefix
  IF v_raw_claim LIKE 'ALLOWLIST:%' THEN
    v_clean_claim := substring(v_raw_claim FROM 11);
  ELSE
    v_clean_claim := v_raw_claim;
  END IF;

  IF trim(v_clean_claim) = '' THEN
    RETURN FALSE;
  END IF;

  -- 4. Check for malformed comma patterns (leading comma, trailing comma, double comma)
  IF v_clean_claim LIKE ',%' OR v_clean_claim LIKE '%,' OR v_clean_claim LIKE '%,,%' THEN
    RETURN FALSE;
  END IF;

  -- 5. Parse into array
  v_ids := string_to_array(v_clean_claim, ',');
  v_count := array_length(v_ids, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RETURN FALSE;
  END IF;

  -- 6. Validate each ID: non-empty, trimmed, no whitespace
  FOREACH v_id IN ARRAY v_ids LOOP
    IF v_id IS NULL OR trim(v_id) = '' OR v_id <> trim(v_id) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  -- 7. Validate no duplicates
  SELECT count(*), count(DISTINCT id_elem)
  INTO v_count, v_distinct_count
  FROM unnest(v_ids) AS id_elem;

  IF v_count <> v_distinct_count THEN
    RETURN FALSE; -- Duplicate IDs in allowlist rejected
  END IF;

  -- 8. Validate all IDs are existing, verified synthetic users
  SELECT count(*)
  INTO v_valid_synthetic_count
  FROM public."User" u
  WHERE u.id = ANY(v_ids) AND u."isSyntheticDemo" = true;

  IF v_valid_synthetic_count <> v_count THEN
    RETURN FALSE; -- Unknown or non-synthetic user in allowlist rejected
  END IF;

  -- 9. Finally, check if target patient is in the allowlist
  RETURN (p_target_patient = ANY(v_ids));
END;
$$ LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_patient_in_bulk_allowlist(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_patient_in_bulk_allowlist(TEXT) TO aarogyadamu_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public.is_patient_in_bulk_allowlist(TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;

-- ============================================================================
-- 4. CONTEXT PARSING & DEDICATED AUDIT EVENT EXTRACTION
-- ============================================================================

-- Hardened verification routine updated to extract dedicated audit_event_id claim (field 11)
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
  v_audit_event_id TEXT;
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
  --    Format: v2|practiceId|userId|role|patientId|isSystemWorker|iat|exp|xid|pid[|auditEventId]
  --    Strict payload validation: must contain exactly 10 fields (base) or 11 fields (with auditEventId).
  v_parts := string_to_array(v_payload, '|');
  IF array_length(v_parts, 1) != 10 AND array_length(v_parts, 1) != 11 THEN
    RETURN NULL; -- Malformed payload structure rejected fail-closed
  END IF;

  v_version := v_parts[1];
  IF v_version != 'v2' THEN
    RETURN NULL; -- Unsupported version rejected fail-closed
  END IF;

  v_practice_id := NULLIF(v_parts[2], '');
  v_user_id := NULLIF(v_parts[3], '');
  v_role := NULLIF(v_parts[4], '');
  v_patient_id := NULLIF(v_parts[5], '');
  v_is_worker := v_parts[6];

  BEGIN
    v_iat := v_parts[7]::bigint;
    v_exp := v_parts[8]::bigint;
    v_signed_xid := v_parts[9];
    v_signed_pid := v_parts[10]::integer;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL; -- Malformed numeric timestamps or PID rejected fail-closed
  END;

  v_audit_event_id := CASE 
    WHEN array_length(v_parts, 1) = 11 THEN NULLIF(v_parts[11], '') 
    ELSE NULL 
  END;

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
  ELSIF p_field = 'audit_event_id' THEN RETURN v_audit_event_id;
  ELSE RETURN NULL;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, _security_vault, pg_temp;

REVOKE EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) TO aarogyadamu_app;

-- Exact unique audit event ID bound to cryptographically verified session context (Field 11)
-- Defined as SECURITY INVOKER with pinned search_path; delegates context verification to _verify_and_get_context()
CREATE OR REPLACE FUNCTION public.current_app_audit_event_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT public._verify_and_get_context('audit_event_id');
$$;

REVOKE EXECUTE ON FUNCTION public.current_app_audit_event_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_audit_event_id() TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public._verify_and_get_context(TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.current_app_audit_event_id() TO aarogyadamu_migrator;
  END IF;
END
$$;

-- ============================================================================
-- 5. HEALTHDOCUMENT COMMAND-SPECIFIC RLS POLICIES
-- ============================================================================

-- A. INSERT Policy: Authorizes patient self-upload, assigned doctor, active care-team member,
--    caregiver with explicit MANAGE_DOCUMENTS consent, DEMO_WORKER (singular explicit context),
--    and DEMO_WORKER_BULK_SEED (signed patient allowlist only).
CREATE POLICY doc_insert_policy ON public."HealthDocument"
FOR INSERT TO aarogyadamu_app
WITH CHECK (
  -- 1. Patient uploading for themselves
  ("userId" = public.current_app_user_id())
  OR
  -- 2. Assigned Doctor uploading for assigned patient
  public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  OR
  -- 3. Active Care Team Member (Nurse, Diabetes Educator, Doctor, Care Coordinator) uploading for care team patient
  EXISTS (
    SELECT 1 FROM public."PatientCareTeamMember" pctm
    WHERE pctm."userId" = public.current_app_user_id()
      AND pctm."patientId" = "HealthDocument"."userId"
      AND pctm."status" = 'ACTIVE'
  )
  OR
  -- 4. Authorized Caregiver with explicit MANAGE_DOCUMENTS consent bound to patient context
  (
    ("userId" = public.current_app_patient_id() OR public.current_app_patient_id() IS NULL)
    AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_DOCUMENTS'::text)
  )
  OR
  -- 5. DEMO_WORKER / DEMO_WORKER_BULK_SEED:
  (
    (
      public.is_system_worker('DEMO_WORKER'::text)
      AND public.current_app_patient_id() IS NOT NULL
      AND "userId" = public.current_app_patient_id()
      AND EXISTS (
        SELECT 1 FROM public."User" u 
        WHERE u.id = "userId" AND u."isSyntheticDemo" = true
      )
    )
    OR
    public.is_patient_in_bulk_allowlist("userId")
  )
);

-- B. SELECT Policy: Scoped visibility for patient, assigned doctor, active care team,
--    consented caregiver, and DEMO_WORKER / DEMO_WORKER_BULK_SEED (allowlisted synthetic patients only).
CREATE POLICY doc_select_policy ON public."HealthDocument"
FOR SELECT TO aarogyadamu_app
USING (
  -- 1. Patient reading their own documents
  ("userId" = public.current_app_user_id())
  OR
  -- 2. Assigned Doctor reading their assigned patient's documents
  public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  OR
  -- 3. Active Care Team Member reading care team patient's documents
  EXISTS (
    SELECT 1 FROM public."PatientCareTeamMember" pctm
    WHERE pctm."userId" = public.current_app_user_id()
      AND pctm."patientId" = "HealthDocument"."userId"
      AND pctm."status" = 'ACTIVE'
  )
  OR
  -- 4. Authorized Caregiver with document view or management permissions bound to patient context
  (
    ("userId" = public.current_app_patient_id() OR public.current_app_patient_id() IS NULL)
    AND (
      public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY'::text)
      OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_DOCUMENTS'::text)
      OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_REPORTS'::text)
      OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_DOCUMENTS'::text)
    )
  )
  OR
  -- 5. DEMO_WORKER / DEMO_WORKER_BULK_SEED:
  (
    (
      public.is_system_worker('DEMO_WORKER'::text)
      AND public.current_app_patient_id() IS NOT NULL
      AND "userId" = public.current_app_patient_id()
      AND EXISTS (
        SELECT 1 FROM public."User" u 
        WHERE u.id = "userId" AND u."isSyntheticDemo" = true
      )
    )
    OR
    public.is_patient_in_bulk_allowlist("userId")
  )
);

-- C. UPDATE Policy: Strict update restrictions; guarded by trg_healthdocument_columns against ownership tampering.
--    Note: DEMO_WORKER_BULK_SEED is permanently excluded from UPDATE (least-privilege bulk seed).
CREATE POLICY doc_update_policy ON public."HealthDocument"
FOR UPDATE TO aarogyadamu_app
USING (
  ("userId" = public.current_app_user_id())
  OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  OR EXISTS (
    SELECT 1 FROM public."PatientCareTeamMember" pctm
    WHERE pctm."userId" = public.current_app_user_id()
      AND pctm."patientId" = "HealthDocument"."userId"
      AND pctm."status" = 'ACTIVE'
  )
  OR (
    public.is_system_worker('DEMO_WORKER'::text)
    AND public.current_app_patient_id() IS NOT NULL
    AND "userId" = public.current_app_patient_id()
    AND EXISTS (
      SELECT 1 FROM public."User" u 
      WHERE u.id = "userId" AND u."isSyntheticDemo" = true
    )
  )
)
WITH CHECK (
  ("userId" = public.current_app_user_id())
  OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  OR EXISTS (
    SELECT 1 FROM public."PatientCareTeamMember" pctm
    WHERE pctm."userId" = public.current_app_user_id()
      AND pctm."patientId" = "HealthDocument"."userId"
      AND pctm."status" = 'ACTIVE'
  )
  OR (
    public.is_system_worker('DEMO_WORKER'::text)
    AND public.current_app_patient_id() IS NOT NULL
    AND "userId" = public.current_app_patient_id()
    AND EXISTS (
      SELECT 1 FROM public."User" u 
      WHERE u.id = "userId" AND u."isSyntheticDemo" = true
    )
  )
);

-- D. DELETE Policy: Strictly restricted to patient, assigned physician, and DEMO_WORKER (singular synthetic patient).
--    Caregivers, care-team staff, and DEMO_WORKER_BULK_SEED are prohibited from deleting documents.
CREATE POLICY doc_delete_policy ON public."HealthDocument"
FOR DELETE TO aarogyadamu_app
USING (
  ("userId" = public.current_app_user_id())
  OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  OR (
    public.is_system_worker('DEMO_WORKER'::text)
    AND public.current_app_patient_id() IS NOT NULL
    AND "userId" = public.current_app_patient_id()
    AND EXISTS (
      SELECT 1 FROM public."User" u 
      WHERE u.id = "userId" AND u."isSyntheticDemo" = true
    )
  )
);

-- ============================================================================
-- 6. AUDITLOG COMMAND-SPECIFIC RLS POLICIES (Append-Only Enforcement)
-- ============================================================================

-- A. INSERT Policy: Authorizes authenticated users and verified workers recording audit events
--    strictly within validated actor and patient subject boundaries.
CREATE POLICY audit_log_insert_policy ON public."AuditLog"
FOR INSERT TO aarogyadamu_app
WITH CHECK (
  -- 1. Authenticated user recording their own or authorized patient actions:
  --    Enforces that actorId ALWAYS matches current_app_user_id(), eliminating spoofing.
  (
    "actorId" = public.current_app_user_id()
    AND (
      -- Self action (e.g. patient viewing/acting for self)
      "userId" = public.current_app_user_id()
      OR
      -- Doctor acting for assigned patient
      public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
      OR
      -- Care Team Member acting for care team patient
      EXISTS (
        SELECT 1 FROM public."PatientCareTeamMember" pctm
        WHERE pctm."userId" = public.current_app_user_id()
          AND pctm."patientId" = "AuditLog"."userId"
          AND pctm."status" = 'ACTIVE'
      )
      OR
      -- Caregiver acting for patient with active consent
      (
        ("userId" = public.current_app_patient_id() OR public.current_app_patient_id() IS NULL)
        AND EXISTS (
          SELECT 1 FROM public."CaregiverConsent" cc
          JOIN public."User" u ON u.email = cc."caregiverEmail"
          WHERE u.id = public.current_app_user_id()
            AND cc."patientId" = "userId"
            AND cc."status" = 'ACTIVE'
            AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
            AND cc."permissions" IS NOT NULL
            AND cc."permissions" <> ''
            AND cc."permissions" <> '[]'
        )
      )
    )
  )
  OR
  -- 2. Dedicated system worker (AUDIT_RECORDER) within validated patient boundary:
  --    - If authenticated context exists, actorId must match current_app_user_id().
  --    - In pure background worker mode (user_id IS NULL), actorId is bound to dedicated system identifier 'SYSTEM_AUDIT_RECORDER'.
  --    - Target patient subject (userId) must match current_app_patient_id() or satisfy clinical relationships.
  (
    public.is_system_worker('AUDIT_RECORDER'::text)
    AND (
      (public.current_app_user_id() IS NOT NULL AND "actorId" = public.current_app_user_id())
      OR
      (
        public.current_app_user_id() IS NULL
        AND "actorId" = 'SYSTEM_AUDIT_RECORDER'
        AND public.current_app_patient_id() IS NOT NULL
        AND "userId" = public.current_app_patient_id()
      )
    )
    AND (
      "userId" = public.current_app_user_id()
      OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
      OR EXISTS (
        SELECT 1 FROM public."PatientCareTeamMember" pctm
        WHERE pctm."userId" = public.current_app_user_id()
          AND pctm."patientId" = "AuditLog"."userId"
          AND pctm."status" = 'ACTIVE'
      )
      OR EXISTS (
        SELECT 1 FROM public."CaregiverConsent" cc
        JOIN public."User" u ON u.email = cc."caregiverEmail"
        WHERE u.id = public.current_app_user_id()
          AND cc."patientId" = "userId"
          AND cc."status" = 'ACTIVE'
          AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
          AND cc."permissions" IS NOT NULL
          AND cc."permissions" <> ''
          AND cc."permissions" <> '[]'
      )
      OR (public.current_app_patient_id() IS NOT NULL AND "userId" = public.current_app_patient_id())
    )
  )
  OR
  -- 3. DEMO_WORKER / DEMO_WORKER_BULK_SEED:
  --    - actorId is strictly bound: current_app_user_id() (if user present) or 'DEMO_WORKER' (if worker).
  --      Arbitrary actor identities are strictly rejected.
  --    - Scoped strictly to explicit synthetic patient context or signed allowlist.
  (
    (
      (
        public.is_system_worker('DEMO_WORKER'::text)
        AND public.current_app_patient_id() IS NOT NULL
        AND "userId" = public.current_app_patient_id()
        AND EXISTS (
          SELECT 1 FROM public."User" u 
          WHERE u.id = "userId" AND u."isSyntheticDemo" = true
        )
      )
      OR
      public.is_patient_in_bulk_allowlist("userId")
    )
    AND (
      (public.current_app_user_id() IS NOT NULL AND "actorId" = public.current_app_user_id())
      OR
      (public.current_app_user_id() IS NULL AND "actorId" = 'DEMO_WORKER')
    )
  )
);

-- B. SELECT Policy: Narrow visibility permitting legitimate actors to retrieve
--    their newly inserted audit events (required for Prisma INSERT RETURNING)
--    and allowing patients/doctors to review legitimate patient audit history.
--    Note: Unrestricted global worker SELECT has been permanently removed.
CREATE POLICY audit_log_read_policy ON public."AuditLog"
FOR SELECT TO aarogyadamu_app
USING (
  -- 1. Subject user / patient reading their own audit history
  ("userId" = public.current_app_user_id())
  OR
  -- 2. Actor retrieving their newly created entry (required by Prisma INSERT RETURNING):
  --    - Authenticated user reading back their own audit record
  --    - Background system audit recorder reading back newly inserted entry:
  --      * FAIL-CLOSED DEDICATED CLAIM MECHANISM: The unique auditEventId claim (field 11 of signed context)
  --        is extracted by current_app_audit_event_id().
  --      * STRICT single-row match ("id" = current_app_audit_event_id()). The worker cannot retrieve ANY other
  --        audit row for the same patient or any other patient.
  --      * Missing or invalid event IDs FAIL CLOSED (evaluates to FALSE). No timestamp fallback.
  (
    public.current_app_audit_event_id() IS NOT NULL
    AND "id" = public.current_app_audit_event_id()
    AND (
      (public.current_app_user_id() IS NOT NULL AND "actorId" = public.current_app_user_id())
      OR
      (
        public.is_system_worker('AUDIT_RECORDER'::text)
        AND "actorId" = 'SYSTEM_AUDIT_RECORDER'
        AND public.current_app_patient_id() IS NOT NULL
        AND "userId" = public.current_app_patient_id()
      )
    )
  )
  OR
  -- 3. Assigned doctor viewing audit logs for assigned patient
  (
    "userId" IS NOT NULL
    AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  )
  OR
  -- 4. Care Team Member viewing audit logs for care team patient
  (
    "userId" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public."PatientCareTeamMember" pctm
      WHERE pctm."userId" = public.current_app_user_id()
        AND pctm."patientId" = "AuditLog"."userId"
        AND pctm."status" = 'ACTIVE'
    )
  )
  OR
  -- 5. DEMO_WORKER / DEMO_WORKER_BULK_SEED:
  (
    (
      public.is_system_worker('DEMO_WORKER'::text)
      AND public.current_app_patient_id() IS NOT NULL
      AND "userId" = public.current_app_patient_id()
      AND EXISTS (
        SELECT 1 FROM public."User" u 
        WHERE u.id = "userId" AND u."isSyntheticDemo" = true
      )
    )
    OR
    public.is_patient_in_bulk_allowlist("userId")
  )
);

-- Note: No UPDATE or DELETE policy is defined for AuditLog, ensuring strict append-only immutability.

-- ============================================================================
-- 7. EXPLICIT GRANTS & IMMUTABILITY ENFORCEMENT
-- ============================================================================

-- Restrict PUBLIC pseudo-role
REVOKE ALL ON public."HealthDocument" FROM PUBLIC;
REVOKE ALL ON public."AuditLog" FROM PUBLIC;

-- Table-level least privilege for application runtime role
GRANT SELECT, INSERT, UPDATE, DELETE ON public."HealthDocument" TO aarogyadamu_app;
GRANT SELECT, INSERT ON public."AuditLog" TO aarogyadamu_app;
REVOKE UPDATE, DELETE ON public."AuditLog" FROM aarogyadamu_app;

COMMIT;
