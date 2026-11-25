-- Migration: 20261116160000_clinical_rls_command_level_hardening_and_caregiver_authorization
-- Purpose: Permanently eliminates FOR ALL policies on clinical and caregiver tables, enforces command-level
--          authorization (SELECT, INSERT, UPDATE, DELETE), secures consultation note immutability,
--          prevents view-only caregiver deletion attacks, gates patient_id context behind active consent,
--          and hardens helper function search paths.

-- 1. Hardened Helper Functions with Schema Qualification and search_path = pg_catalog, pg_temp
CREATE OR REPLACE FUNCTION public.is_doctor_assigned_to_patient(p_doc TEXT, p_patient TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."DoctorPatientAssignment"
    WHERE "doctorId" = p_doc AND "patientId" = p_patient AND "status" = 'ACTIVE'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION public.has_caregiver_consent(p_caregiver_user TEXT, p_patient TEXT, p_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."CaregiverConsent" cc
    JOIN public."User" u ON u.email = cc."caregiverEmail"
    WHERE u.id = p_caregiver_user 
      AND cc."patientId" = p_patient 
      AND cc."status" = 'ACTIVE' 
      AND (cc."expiresAt" IS NULL OR cc."expiresAt" > CURRENT_TIMESTAMP)
      AND (p_permission IS NULL OR cc."permissions" LIKE '%' || p_permission || '%')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_app;

REVOKE EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_migrator') THEN
    GRANT EXECUTE ON FUNCTION public.is_doctor_assigned_to_patient(TEXT, TEXT) TO aarogyadamu_migrator;
    GRANT EXECUTE ON FUNCTION public.has_caregiver_consent(TEXT, TEXT, TEXT) TO aarogyadamu_migrator;
  END IF;
END
$$;

-- 2. HealthObservation: Command-Specific Policies (Caregivers Cannot Delete or Update)
DROP POLICY IF EXISTS observation_patient_policy ON "HealthObservation";
DROP POLICY IF EXISTS obs_select_policy ON "HealthObservation";
DROP POLICY IF EXISTS obs_insert_policy ON "HealthObservation";
DROP POLICY IF EXISTS obs_update_policy ON "HealthObservation";
DROP POLICY IF EXISTS obs_delete_policy ON "HealthObservation";

CREATE POLICY obs_select_policy ON "HealthObservation"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_OBSERVATIONS')
      )
    )
  );

CREATE POLICY obs_insert_policy ON "HealthObservation"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'LOG_ON_BEHALF')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_OBSERVATIONS')
      )
    )
  );

CREATE POLICY obs_update_policy ON "HealthObservation"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY obs_delete_policy ON "HealthObservation"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- 3. MedicationSchedule: Command-Specific Policies (Caregivers & Patients Cannot Delete Doctor Prescriptions)
DROP POLICY IF EXISTS medication_schedule_policy ON "MedicationSchedule";
DROP POLICY IF EXISTS med_sched_select_policy ON "MedicationSchedule";
DROP POLICY IF EXISTS med_sched_insert_policy ON "MedicationSchedule";
DROP POLICY IF EXISTS med_sched_update_policy ON "MedicationSchedule";
DROP POLICY IF EXISTS med_sched_delete_policy ON "MedicationSchedule";

CREATE POLICY med_sched_select_policy ON "MedicationSchedule"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS')
    )
  );

CREATE POLICY med_sched_insert_policy ON "MedicationSchedule"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR "userId" = public.current_app_user_id()
  );

CREATE POLICY med_sched_update_policy ON "MedicationSchedule"
  FOR UPDATE TO aarogyadamu_app
  USING (
    public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR "userId" = public.current_app_user_id()
  )
  WITH CHECK (
    public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR "userId" = public.current_app_user_id()
  );

CREATE POLICY med_sched_delete_policy ON "MedicationSchedule"
  FOR DELETE TO aarogyadamu_app
  USING (
    public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- 4. MedicationAdherenceEvent: Command-Specific Policies (Caregivers Cannot Delete Logs)
DROP POLICY IF EXISTS medication_adherence_policy ON "MedicationAdherenceEvent";
DROP POLICY IF EXISTS med_adh_select_policy ON "MedicationAdherenceEvent";
DROP POLICY IF EXISTS med_adh_insert_policy ON "MedicationAdherenceEvent";
DROP POLICY IF EXISTS med_adh_update_policy ON "MedicationAdherenceEvent";
DROP POLICY IF EXISTS med_adh_delete_policy ON "MedicationAdherenceEvent";

CREATE POLICY med_adh_select_policy ON "MedicationAdherenceEvent"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATIONS')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_MEDICATION_ADHERENCE')
      )
    )
  );

CREATE POLICY med_adh_insert_policy ON "MedicationAdherenceEvent"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'RECORD_MEDICATION_TAKEN')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'LOG_ADHERENCE')
      )
    )
  );

CREATE POLICY med_adh_update_policy ON "MedicationAdherenceEvent"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY med_adh_delete_policy ON "MedicationAdherenceEvent"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- 5. HealthDocument: Command-Specific Policies (Caregivers Cannot Delete Documents)
DROP POLICY IF EXISTS health_document_policy ON "HealthDocument";
DROP POLICY IF EXISTS doc_select_policy ON "HealthDocument";
DROP POLICY IF EXISTS doc_insert_policy ON "HealthDocument";
DROP POLICY IF EXISTS doc_update_policy ON "HealthDocument";
DROP POLICY IF EXISTS doc_delete_policy ON "HealthDocument";

CREATE POLICY doc_select_policy ON "HealthDocument"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_HEALTH_SUMMARY')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_DOCUMENTS')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_REPORTS')
      )
    )
  );

CREATE POLICY doc_insert_policy ON "HealthDocument"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY doc_update_policy ON "HealthDocument"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY doc_delete_policy ON "HealthDocument"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- 6. CarePlan: Command-Specific Policies (Patients & Caregivers Cannot Delete Plans)
DROP POLICY IF EXISTS careplan_policy ON "CarePlan";
DROP POLICY IF EXISTS plan_select_policy ON "CarePlan";
DROP POLICY IF EXISTS plan_insert_policy ON "CarePlan";
DROP POLICY IF EXISTS plan_update_policy ON "CarePlan";
DROP POLICY IF EXISTS plan_delete_policy ON "CarePlan";

CREATE POLICY plan_select_policy ON "CarePlan"
  FOR SELECT TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "doctorId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "patientId")
    OR (
      "patientId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "patientId", 'VIEW_CARE_PLAN')
    )
  );

CREATE POLICY plan_insert_policy ON "CarePlan"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "doctorId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "patientId")
  );

CREATE POLICY plan_update_policy ON "CarePlan"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "doctorId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "patientId")
  )
  WITH CHECK (
    "doctorId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "patientId")
  );

CREATE POLICY plan_delete_policy ON "CarePlan"
  FOR DELETE TO aarogyadamu_app
  USING (
    "doctorId" = public.current_app_user_id()
  );

-- 7. CareTask: Command-Specific Policies (Caregivers Cannot Delete Tasks)
DROP POLICY IF EXISTS caretask_policy ON "CareTask";
DROP POLICY IF EXISTS task_select_policy ON "CareTask";
DROP POLICY IF EXISTS task_insert_policy ON "CareTask";
DROP POLICY IF EXISTS task_update_policy ON "CareTask";
DROP POLICY IF EXISTS task_delete_policy ON "CareTask";

CREATE POLICY task_select_policy ON "CareTask"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_TASKS')
    )
  );

CREATE POLICY task_insert_policy ON "CareTask"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

CREATE POLICY task_update_policy ON "CareTask"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_TASKS')
      )
    )
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND (
        public.has_caregiver_consent(public.current_app_user_id(), "userId", 'COMPLETE_TASKS_ON_BEHALF')
        OR public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_TASKS')
      )
    )
  );

CREATE POLICY task_delete_policy ON "CareTask"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
  );

-- 8. CareTeamMessage: Command-Specific Policies (Recipients Cannot Delete Senders' Messages)
DROP POLICY IF EXISTS care_team_message_policy ON "CareTeamMessage";
DROP POLICY IF EXISTS msg_select_policy ON "CareTeamMessage";
DROP POLICY IF EXISTS msg_insert_policy ON "CareTeamMessage";
DROP POLICY IF EXISTS msg_update_policy ON "CareTeamMessage";
DROP POLICY IF EXISTS msg_delete_policy ON "CareTeamMessage";

CREATE POLICY msg_select_policy ON "CareTeamMessage"
  FOR SELECT TO aarogyadamu_app
  USING (
    "senderId" = public.current_app_user_id()
    OR "recipientId" = public.current_app_user_id()
    OR "patientId" = public.current_app_user_id()
  );

CREATE POLICY msg_insert_policy ON "CareTeamMessage"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "senderId" = public.current_app_user_id()
  );

CREATE POLICY msg_update_policy ON "CareTeamMessage"
  FOR UPDATE TO aarogyadamu_app
  USING ("senderId" = public.current_app_user_id())
  WITH CHECK ("senderId" = public.current_app_user_id());

CREATE POLICY msg_delete_policy ON "CareTeamMessage"
  FOR DELETE TO aarogyadamu_app
  USING ("senderId" = public.current_app_user_id());

-- 9. CaregiverConsent: Command-Specific Policies (Caregivers Cannot Escalate or Prevent Revocation)
DROP POLICY IF EXISTS caregiver_consent_policy ON "CaregiverConsent";
DROP POLICY IF EXISTS consent_select_policy ON "CaregiverConsent";
DROP POLICY IF EXISTS consent_insert_policy ON "CaregiverConsent";
DROP POLICY IF EXISTS consent_update_policy ON "CaregiverConsent";
DROP POLICY IF EXISTS consent_delete_policy ON "CaregiverConsent";

CREATE POLICY consent_select_policy ON "CaregiverConsent"
  FOR SELECT TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR "caregiverEmail" = (SELECT email FROM public."User" WHERE id = public.current_app_user_id())
  );

CREATE POLICY consent_insert_policy ON "CaregiverConsent"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "patientId" = public.current_app_user_id()
  );

CREATE POLICY consent_update_policy ON "CaregiverConsent"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
    OR ("caregiverEmail" = (SELECT email FROM public."User" WHERE id = public.current_app_user_id()) AND "status" = 'PENDING')
  )
  WITH CHECK (
    "patientId" = public.current_app_user_id()
    OR ("caregiverEmail" = (SELECT email FROM public."User" WHERE id = public.current_app_user_id()) AND "status" IN ('ACTIVE', 'REJECTED'))
  );

CREATE POLICY consent_delete_policy ON "CaregiverConsent"
  FOR DELETE TO aarogyadamu_app
  USING (
    "patientId" = public.current_app_user_id()
  );

-- 10. ConsultationNote: Command-Specific Policies & Immutable Finalized Records
DROP POLICY IF EXISTS consultation_note_policy ON "ConsultationNote";
DROP POLICY IF EXISTS note_select_policy ON "ConsultationNote";
DROP POLICY IF EXISTS note_insert_policy ON "ConsultationNote";
DROP POLICY IF EXISTS note_update_policy ON "ConsultationNote";
DROP POLICY IF EXISTS note_delete_policy ON "ConsultationNote";

CREATE POLICY note_select_policy ON "ConsultationNote"
  FOR SELECT TO aarogyadamu_app
  USING (
    "clinicianId" = public.current_app_user_id()
    OR ("userId" = public.current_app_user_id() AND ("sharedWithPatient" = true OR "status" = 'APPROVED'))
    OR (
      "userId" = public.current_app_patient_id()
      AND public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    )
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_CONSULTATIONS')
      AND ("sharedWithPatient" = true OR "status" = 'APPROVED')
    )
    OR (EXISTS (
      SELECT 1 FROM public."PracticeMembership" pm_doc
      JOIN public."PracticeMembership" pm_actor ON pm_doc."practiceId" = pm_actor."practiceId"
      WHERE pm_doc."userId" = "ConsultationNote"."clinicianId"
        AND pm_actor."userId" = public.current_app_user_id()
        AND pm_actor."practiceId" = public.current_app_practice_id()
        AND pm_doc."isActive" = true
        AND pm_actor."isActive" = true
        AND (pm_actor."role" IN ('OWNER', 'ADMIN') OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "ConsultationNote"."userId"))
    ))
  );

CREATE POLICY note_insert_policy ON "ConsultationNote"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "clinicianId" = public.current_app_user_id()
    AND (EXISTS (
      SELECT 1 FROM public."PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = public.current_app_practice_id()
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."isActive" = true
    ))
  );

-- Finalized notes (status = 'APPROVED') are strictly IMMUTABLE.
CREATE POLICY note_update_policy ON "ConsultationNote"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "clinicianId" = public.current_app_user_id()
    AND "status" != 'APPROVED'
  )
  WITH CHECK (
    "clinicianId" = public.current_app_user_id()
  );

-- Patients CANNOT delete notes. Finalized notes CANNOT be deleted.
CREATE POLICY note_delete_policy ON "ConsultationNote"
  FOR DELETE TO aarogyadamu_app
  USING (
    "clinicianId" = public.current_app_user_id()
    AND "status" = 'DRAFT'
  );

-- 11. ConsultationNoteVersion: Append-Only Versioning
DROP POLICY IF EXISTS consultation_note_version_policy ON "ConsultationNoteVersion";
DROP POLICY IF EXISTS note_ver_select_policy ON "ConsultationNoteVersion";
DROP POLICY IF EXISTS note_ver_insert_policy ON "ConsultationNoteVersion";
DROP POLICY IF EXISTS note_ver_update_policy ON "ConsultationNoteVersion";
DROP POLICY IF EXISTS note_ver_delete_policy ON "ConsultationNoteVersion";

CREATE POLICY note_ver_select_policy ON "ConsultationNoteVersion"
  FOR SELECT TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM public."ConsultationNote" WHERE id = "noteId"));

CREATE POLICY note_ver_insert_policy ON "ConsultationNoteVersion"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "noteId"
        AND "clinicianId" = public.current_app_user_id()
    )
  );

CREATE POLICY note_ver_update_policy ON "ConsultationNoteVersion"
  FOR UPDATE TO aarogyadamu_app
  USING (false);

CREATE POLICY note_ver_delete_policy ON "ConsultationNoteVersion"
  FOR DELETE TO aarogyadamu_app
  USING (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "noteId"
        AND "clinicianId" = public.current_app_user_id()
        AND "status" = 'DRAFT'
    )
  );

-- 12. ConsultationPrescriptionItem: Inherited Immutability
DROP POLICY IF EXISTS prescription_item_policy ON "ConsultationPrescriptionItem";
DROP POLICY IF EXISTS rx_select_policy ON "ConsultationPrescriptionItem";
DROP POLICY IF EXISTS rx_insert_policy ON "ConsultationPrescriptionItem";
DROP POLICY IF EXISTS rx_update_policy ON "ConsultationPrescriptionItem";
DROP POLICY IF EXISTS rx_delete_policy ON "ConsultationPrescriptionItem";

CREATE POLICY rx_select_policy ON "ConsultationPrescriptionItem"
  FOR SELECT TO aarogyadamu_app
  USING (EXISTS (SELECT 1 FROM public."ConsultationNote" WHERE id = "consultationNoteId"));

CREATE POLICY rx_insert_policy ON "ConsultationPrescriptionItem"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "consultationNoteId"
        AND "clinicianId" = public.current_app_user_id()
    )
  );

CREATE POLICY rx_update_policy ON "ConsultationPrescriptionItem"
  FOR UPDATE TO aarogyadamu_app
  USING (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "consultationNoteId"
        AND "clinicianId" = public.current_app_user_id()
        AND "status" != 'APPROVED'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "consultationNoteId"
        AND "clinicianId" = public.current_app_user_id()
        AND "status" != 'APPROVED'
    )
  );

CREATE POLICY rx_delete_policy ON "ConsultationPrescriptionItem"
  FOR DELETE TO aarogyadamu_app
  USING (
    EXISTS (
      SELECT 1 FROM public."ConsultationNote"
      WHERE id = "consultationNoteId"
        AND "clinicianId" = public.current_app_user_id()
        AND "status" != 'APPROVED'
    )
  );

-- 13. LifestyleRecord: Command-Specific Policies (Caregivers Cannot Delete)
DROP POLICY IF EXISTS lifestyle_record_policy ON "LifestyleRecord";
DROP POLICY IF EXISTS life_select_policy ON "LifestyleRecord";
DROP POLICY IF EXISTS life_insert_policy ON "LifestyleRecord";
DROP POLICY IF EXISTS life_update_policy ON "LifestyleRecord";
DROP POLICY IF EXISTS life_delete_policy ON "LifestyleRecord";

CREATE POLICY life_select_policy ON "LifestyleRecord"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_LIFESTYLE')
    )
  );

CREATE POLICY life_insert_policy ON "LifestyleRecord"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_LIFESTYLE')
    )
  );

CREATE POLICY life_update_policy ON "LifestyleRecord"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_LIFESTYLE')
    )
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_LIFESTYLE')
    )
  );

CREATE POLICY life_delete_policy ON "LifestyleRecord"
  FOR DELETE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
  );

-- 14. EmergencyContact: Command-Specific Policies
DROP POLICY IF EXISTS emergency_contact_policy ON "EmergencyContact";
DROP POLICY IF EXISTS emerg_contact_select_policy ON "EmergencyContact";
DROP POLICY IF EXISTS emerg_contact_insert_policy ON "EmergencyContact";
DROP POLICY IF EXISTS emerg_contact_update_policy ON "EmergencyContact";
DROP POLICY IF EXISTS emerg_contact_delete_policy ON "EmergencyContact";

CREATE POLICY emerg_contact_select_policy ON "EmergencyContact"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR public.is_doctor_assigned_to_patient(public.current_app_user_id(), "userId")
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_EMERGENCY')
    )
  );

CREATE POLICY emerg_contact_insert_policy ON "EmergencyContact"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK ("userId" = public.current_app_user_id());

CREATE POLICY emerg_contact_update_policy ON "EmergencyContact"
  FOR UPDATE TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id())
  WITH CHECK ("userId" = public.current_app_user_id());

CREATE POLICY emerg_contact_delete_policy ON "EmergencyContact"
  FOR DELETE TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id());

-- 15. Reminder: Command-Specific Policies
DROP POLICY IF EXISTS reminder_policy ON "Reminder";
DROP POLICY IF EXISTS rem_select_policy ON "Reminder";
DROP POLICY IF EXISTS rem_insert_policy ON "Reminder";
DROP POLICY IF EXISTS rem_update_policy ON "Reminder";
DROP POLICY IF EXISTS rem_delete_policy ON "Reminder";

CREATE POLICY rem_select_policy ON "Reminder"
  FOR SELECT TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'VIEW_REMINDERS')
    )
  );

CREATE POLICY rem_insert_policy ON "Reminder"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_REMINDERS')
    )
  );

CREATE POLICY rem_update_policy ON "Reminder"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_REMINDERS')
    )
  )
  WITH CHECK (
    "userId" = public.current_app_user_id()
    OR (
      "userId" = public.current_app_patient_id()
      AND public.has_caregiver_consent(public.current_app_user_id(), "userId", 'MANAGE_REMINDERS')
    )
  );

CREATE POLICY rem_delete_policy ON "Reminder"
  FOR DELETE TO aarogyadamu_app
  USING ("userId" = public.current_app_user_id());

-- 16. PatientEncounterBilling: Command-Specific Policies (Patients Cannot Delete Invoices)
DROP POLICY IF EXISTS billing_tenant_policy ON "PatientEncounterBilling";
DROP POLICY IF EXISTS billing_select_policy ON "PatientEncounterBilling";
DROP POLICY IF EXISTS billing_insert_policy ON "PatientEncounterBilling";
DROP POLICY IF EXISTS billing_update_policy ON "PatientEncounterBilling";
DROP POLICY IF EXISTS billing_delete_policy ON "PatientEncounterBilling";

CREATE POLICY billing_select_policy ON "PatientEncounterBilling"
  FOR SELECT TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    OR "patientId" = public.current_app_user_id()
  );

CREATE POLICY billing_insert_policy ON "PatientEncounterBilling"
  FOR INSERT TO aarogyadamu_app
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
  );

CREATE POLICY billing_update_policy ON "PatientEncounterBilling"
  FOR UPDATE TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
  )
  WITH CHECK (
    "practiceId" = public.current_app_practice_id()
  );

CREATE POLICY billing_delete_policy ON "PatientEncounterBilling"
  FOR DELETE TO aarogyadamu_app
  USING (
    "practiceId" = public.current_app_practice_id()
    AND EXISTS (
      SELECT 1 FROM public."PracticeMembership"
      WHERE "PracticeMembership"."practiceId" = "PatientEncounterBilling"."practiceId"
        AND "PracticeMembership"."userId" = public.current_app_user_id()
        AND "PracticeMembership"."role" = 'OWNER'
        AND "PracticeMembership"."isActive" = true
    )
  );
