-- Migration: 20261116170000_consent_helper_hardening_and_column_level_lifecycle_guards
-- Purpose: 
-- 1. Hardens has_caregiver_consent with exact JSONB array containment, wildcard rejection, caller identity binding, and anti-oracle defenses.
-- 2. Enforces column-level field immutability on CareTask, HealthObservation, MedicationSchedule, LifestyleRecord, and Reminder.
-- 3. Enforces ConsultationNote INSERT and UPDATE invariants (ownership, practice membership, treatment relationship, approved note immutability).
-- 4. Restricts ConsultationPrescriptionItem insertions into approved notes (only permitted within atomic finalization transaction).
-- 5. Enforces unconditional append-only versioning on ConsultationNoteVersion (both UPDATE and DELETE blocked).
-- 6. Protects historical adherence audit trails by blocking MedicationAdherenceEvent hard deletions.

-- =========================================================================
-- 1. HARDENED has_caregiver_consent WITH EXACT JSONB CONTAINMENT & IDENTITY BINDING
-- =========================================================================

CREATE OR REPLACE FUNCTION public.has_caregiver_consent(
  p_caregiver_user TEXT, 
  p_patient TEXT, 
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller TEXT;
BEGIN
  -- 1. Disallow NULL, empty, or whitespace-only permission string
  IF p_permission IS NULL OR trim(p_permission) = '' THEN
    RETURN FALSE;
  END IF;

  -- 2. Reject SQL wildcards ('%' and standalone '_') to prevent arbitrary matching
  IF p_permission = '%' OR p_permission = '_' OR p_permission LIKE '%\%%' THEN
    RETURN FALSE;
  END IF;

  -- 3. Identity binding: Extract authenticated caller
  v_caller := public.current_app_user_id();
  IF v_caller IS NULL OR v_caller = '' THEN
    RETURN FALSE;
  END IF;

  -- 4. Anti-Oracle Defense: Caller cannot inspect arbitrary third-party relationships
  IF p_caregiver_user IS NOT NULL AND p_caregiver_user != v_caller THEN
    RETURN FALSE;
  END IF;

  -- 5. Exact JSON array containment: Cast permissions to JSONB and query with '?' operator
  RETURN EXISTS (
    SELECT 1 
    FROM public."CaregiverConsent" cc
    JOIN public."User" u ON u.email = cc."caregiverEmail"
    WHERE u.id = v_caller 
      AND cc."patientId" = p_patient 
      AND cc."status" = 'ACTIVE' 
      AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
      AND (
        CASE 
          WHEN cc."permissions" IS NULL OR cc."permissions" = '' THEN FALSE
          ELSE (cc."permissions"::jsonb ? p_permission)
        END
      )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Fail-closed on invalid JSON or unexpected cast errors
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

-- Overload: 2-parameter signature automatically binding authenticated caller
CREATE OR REPLACE FUNCTION public.has_caregiver_consent(
  p_patient TEXT, 
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
  SELECT public.has_caregiver_consent(public.current_app_user_id(), p_patient, p_permission);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT) TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;


-- =========================================================================
-- 2. COLUMN-LEVEL FIELD AUTHORIZATION TRIGGERS
-- =========================================================================

-- 2.1 CareTask: Caregivers and patients cannot reassign ownership or modify clinical instructions
CREATE OR REPLACE FUNCTION public.trg_caretask_column_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
  v_is_doc BOOLEAN;
BEGIN
  v_user := public.current_app_user_id();

  -- Prevent transferring task to another patient
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot transfer CareTask to a different patient' 
      USING ERRCODE = '42501';
  END IF;

  -- Prevent modifying creation timestamp
  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot modify CareTask creation timestamp' 
      USING ERRCODE = '42501';
  END IF;

  -- Check if caller is an assigned clinician
  v_is_doc := public.is_doctor_assigned_to_patient(v_user, OLD."userId");

  -- Caregivers and patients can only update task completion fields: status, completedAt, completedById, completedByRole, updatedAt
  IF NOT v_is_doc THEN
    IF NEW."title" IS DISTINCT FROM OLD."title" 
       OR NEW."instructions" IS DISTINCT FROM OLD."instructions"
       OR NEW."clinicalNotes" IS DISTINCT FROM OLD."clinicalNotes"
       OR NEW."category" IS DISTINCT FROM OLD."category"
       OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
       OR NEW."assignedById" IS DISTINCT FROM OLD."assignedById"
       OR NEW."carePlanId" IS DISTINCT FROM OLD."carePlanId" THEN
      RAISE EXCEPTION 'Unauthorized column update on CareTask: caregivers and patients cannot modify clinical instructions, category, dueAt, or assignedById'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_caretask_columns ON public."CareTask";
CREATE TRIGGER trg_caretask_columns
  BEFORE UPDATE ON public."CareTask"
  FOR EACH ROW EXECUTE FUNCTION public.trg_caretask_column_guard();

-- 2.2 HealthObservation: Patient ownership and creation timestamp are immutable
CREATE OR REPLACE FUNCTION public.trg_healthobservation_column_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot reassign HealthObservation patient ownership'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot mutate HealthObservation creation timestamp'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_healthobservation_columns ON public."HealthObservation";
CREATE TRIGGER trg_healthobservation_columns
  BEFORE UPDATE ON public."HealthObservation"
  FOR EACH ROW EXECUTE FUNCTION public.trg_healthobservation_column_guard();

-- 2.3 MedicationSchedule: Clinical prescription parameters protected from non-clinicians
CREATE OR REPLACE FUNCTION public.trg_medicationschedule_column_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
  v_is_doc BOOLEAN;
BEGIN
  v_user := public.current_app_user_id();

  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot transfer MedicationSchedule to a different patient'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot mutate MedicationSchedule creation timestamp'
      USING ERRCODE = '42501';
  END IF;

  v_is_doc := public.is_doctor_assigned_to_patient(v_user, OLD."userId");

  -- Non-clinicians cannot mutate clinical prescription metadata
  IF NOT v_is_doc THEN
    IF NEW."prescriber" IS DISTINCT FROM OLD."prescriber"
       OR NEW."medicineName" IS DISTINCT FROM OLD."medicineName"
       OR NEW."medicationName" IS DISTINCT FROM OLD."medicationName"
       OR NEW."dosage" IS DISTINCT FROM OLD."dosage" THEN
      RAISE EXCEPTION 'Unauthorized column update on MedicationSchedule: only assigned clinicians can modify prescription parameters'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_medicationschedule_columns ON public."MedicationSchedule";
CREATE TRIGGER trg_medicationschedule_columns
  BEFORE UPDATE ON public."MedicationSchedule"
  FOR EACH ROW EXECUTE FUNCTION public.trg_medicationschedule_column_guard();

-- 2.4 LifestyleRecord: Ownership and timestamp immutable
CREATE OR REPLACE FUNCTION public.trg_lifestylerecord_column_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot transfer LifestyleRecord to another user'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot mutate LifestyleRecord creation timestamp'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_lifestylerecord_columns ON public."LifestyleRecord";
CREATE TRIGGER trg_lifestylerecord_columns
  BEFORE UPDATE ON public."LifestyleRecord"
  FOR EACH ROW EXECUTE FUNCTION public.trg_lifestylerecord_column_guard();

-- 2.5 Reminder: Ownership and timestamp immutable
CREATE OR REPLACE FUNCTION public.trg_reminder_column_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Ownership violation: cannot transfer Reminder to another user'
      USING ERRCODE = '42501';
  END IF;

  IF NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Audit violation: cannot mutate Reminder creation timestamp'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_reminder_columns ON public."Reminder";
CREATE TRIGGER trg_reminder_columns
  BEFORE UPDATE ON public."Reminder"
  FOR EACH ROW EXECUTE FUNCTION public.trg_reminder_column_guard();


-- =========================================================================
-- 3. CONSULTATION NOTE INVARIANTS & LIFECYCLE GUARD
-- =========================================================================

CREATE OR REPLACE FUNCTION public.trg_consultation_note_lifecycle_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
  v_practice TEXT;
  v_has_membership BOOLEAN;
  v_has_patient_rel BOOLEAN;
BEGIN
  v_user := public.current_app_user_id();
  v_practice := public.current_app_practice_id();

  IF TG_OP = 'INSERT' THEN
    -- 1. Clinician author must match authenticated user
    IF NEW."clinicianId" != v_user THEN
      RAISE EXCEPTION 'Clinician author mismatch: clinicianId must match authenticated user'
        USING ERRCODE = '42501';
    END IF;

    -- 2. Clinician must hold active membership in current practice
    SELECT EXISTS (
      SELECT 1 FROM public."PracticeMembership"
      WHERE "userId" = v_user AND "practiceId" = v_practice AND "isActive" = true
    ) INTO v_has_membership;

    IF NOT v_has_membership THEN
      RAISE EXCEPTION 'Unauthorized practice: clinician must hold active membership in current practice'
        USING ERRCODE = '42501';
    END IF;

    -- 3. Target patient must be associated with the clinician or practice
    SELECT EXISTS (
      SELECT 1 FROM public."DoctorPatientAssignment"
      WHERE "doctorId" = v_user AND "patientId" = NEW."userId" AND "status" = 'ACTIVE'
    ) OR EXISTS (
      SELECT 1 FROM public."Appointment"
      WHERE "patientId" = NEW."userId" AND "doctorId" = v_user
    ) OR EXISTS (
      SELECT 1 FROM public."PracticeMembership" pm
      WHERE pm."userId" = NEW."userId" AND pm."practiceId" = v_practice
    ) INTO v_has_patient_rel;

    IF NOT v_has_patient_rel THEN
      RAISE EXCEPTION 'Treatment relationship required: target patient is not assigned to or scheduled with this practice'
        USING ERRCODE = '42501';
    END IF;

    -- 4. Initial status must be valid
    IF NEW."status" NOT IN ('DRAFT', 'RECORDING', 'APPROVED') THEN
      RAISE EXCEPTION 'Invalid initial consultation status: must be DRAFT, RECORDING, or APPROVED'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Finalized note immutability
    IF OLD."status" = 'APPROVED' THEN
      RAISE EXCEPTION 'Finalized consultation notes are strictly immutable and cannot be updated'
        USING ERRCODE = '42501';
    END IF;

    -- Protected identity fields cannot be modified during draft updates
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."clinicianId" IS DISTINCT FROM OLD."clinicianId"
       OR NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
      RAISE EXCEPTION 'Identity field immutability: cannot reassign patient, clinician, appointment, or createdAt on ConsultationNote'
        USING ERRCODE = '42501';
    END IF;

    -- Valid status transition
    IF OLD."status" IN ('DRAFT', 'RECORDING') AND NEW."status" NOT IN ('DRAFT', 'RECORDING', 'APPROVED', 'REJECTED') THEN
      RAISE EXCEPTION 'Invalid status transition for ConsultationNote'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Finalized notes can NEVER be deleted
    IF OLD."status" = 'APPROVED' THEN
      RAISE EXCEPTION 'Finalized consultation notes are strictly immutable and cannot be deleted'
        USING ERRCODE = '42501';
    END IF;

    -- Only draft author clinician can delete draft
    IF OLD."clinicianId" != v_user THEN
      RAISE EXCEPTION 'Only author clinician can delete draft consultation note'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_consultation_note_lifecycle ON public."ConsultationNote";
CREATE TRIGGER trg_consultation_note_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public."ConsultationNote"
  FOR EACH ROW EXECUTE FUNCTION public.trg_consultation_note_lifecycle_guard();


-- =========================================================================
-- 4. PRESCRIPTION ITEM INSERTION & IMMUTABILITY GUARD
-- =========================================================================

CREATE OR REPLACE FUNCTION public.trg_prescription_item_lifecycle_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_user TEXT;
  v_note_status TEXT;
  v_note_clinician TEXT;
  v_created_xact BOOLEAN;
BEGIN
  v_user := public.current_app_user_id();

  IF TG_OP = 'INSERT' THEN
    SELECT "status", "clinicianId", (xmin::text = pg_current_xact_id()::text)
    INTO v_note_status, v_note_clinician, v_created_xact
    FROM public."ConsultationNote"
    WHERE id = NEW."consultationNoteId";

    IF v_note_status IS NULL THEN
      RAISE EXCEPTION 'Parent consultation note does not exist' USING ERRCODE = '42501';
    END IF;

    IF v_note_clinician != v_user THEN
      RAISE EXCEPTION 'Only author clinician can insert prescription items for a consultation note'
        USING ERRCODE = '42501';
    END IF;

    -- If parent note is already APPROVED:
    -- Only allow insertion if parent note was created in the EXACT SAME transaction
    -- (i.e. atomic finalizeConsultation service)
    -- Subsequent transactions cannot insert prescription items into an already-approved note!
    IF v_note_status = 'APPROVED' AND NOT v_created_xact THEN
      RAISE EXCEPTION 'Cannot insert prescription items into an already-finalized consultation note outside initial creation'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    SELECT "status", "clinicianId"
    INTO v_note_status, v_note_clinician
    FROM public."ConsultationNote"
    WHERE id = OLD."consultationNoteId";

    IF v_note_status = 'APPROVED' THEN
      RAISE EXCEPTION 'Prescription items attached to an approved consultation note are strictly immutable'
        USING ERRCODE = '42501';
    END IF;

    IF NEW."consultationNoteId" IS DISTINCT FROM OLD."consultationNoteId" THEN
      RAISE EXCEPTION 'Cannot reassign parent consultation note reference on prescription item'
        USING ERRCODE = '42501';
    END IF;

    IF v_note_clinician != v_user THEN
      RAISE EXCEPTION 'Only author clinician can update draft prescription items'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    SELECT "status", "clinicianId"
    INTO v_note_status, v_note_clinician
    FROM public."ConsultationNote"
    WHERE id = OLD."consultationNoteId";

    IF v_note_status = 'APPROVED' THEN
      RAISE EXCEPTION 'Prescription items attached to an approved consultation note cannot be deleted'
        USING ERRCODE = '42501';
    END IF;

    IF v_note_clinician != v_user THEN
      RAISE EXCEPTION 'Only author clinician can delete draft prescription items'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_prescription_item_lifecycle ON public."ConsultationPrescriptionItem";
CREATE TRIGGER trg_prescription_item_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public."ConsultationPrescriptionItem"
  FOR EACH ROW EXECUTE FUNCTION public.trg_prescription_item_lifecycle_guard();


-- =========================================================================
-- 5. CONSULTATION NOTE VERSION STRICT APPEND-ONLY ENFORCEMENT
-- =========================================================================

CREATE OR REPLACE FUNCTION public.trg_note_version_append_only_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ConsultationNoteVersion is strictly append-only and cannot be updated'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ConsultationNoteVersion is strictly append-only and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_note_version_append_only ON public."ConsultationNoteVersion";
CREATE TRIGGER trg_note_version_append_only
  BEFORE UPDATE OR DELETE ON public."ConsultationNoteVersion"
  FOR EACH ROW EXECUTE FUNCTION public.trg_note_version_append_only_guard();

-- Also set RLS policies to unconditionally reject UPDATE and DELETE
DROP POLICY IF EXISTS note_ver_update_policy ON "ConsultationNoteVersion";
CREATE POLICY note_ver_update_policy ON "ConsultationNoteVersion"
  FOR UPDATE TO aarogyadamu_app
  USING (false);

DROP POLICY IF EXISTS note_ver_delete_policy ON "ConsultationNoteVersion";
CREATE POLICY note_ver_delete_policy ON "ConsultationNoteVersion"
  FOR DELETE TO aarogyadamu_app
  USING (false);


-- =========================================================================
-- 6. MEDICATION ADHERENCE AUDIT TRAIL IMMUTABILITY GUARD
-- =========================================================================

CREATE OR REPLACE FUNCTION public.trg_adherence_event_immutable_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MedicationAdherenceEvent records represent historical patient adherence and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_adherence_event_immutable ON public."MedicationAdherenceEvent";
CREATE TRIGGER trg_adherence_event_immutable
  BEFORE DELETE ON public."MedicationAdherenceEvent"
  FOR EACH ROW EXECUTE FUNCTION public.trg_adherence_event_immutable_guard();

-- Set RLS policy on MedicationAdherenceEvent to reject DELETE
DROP POLICY IF EXISTS med_adh_delete_policy ON "MedicationAdherenceEvent";
CREATE POLICY med_adh_delete_policy ON "MedicationAdherenceEvent"
  FOR DELETE TO aarogyadamu_app
  USING (false);
