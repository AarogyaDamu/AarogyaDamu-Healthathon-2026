import {
  AgentPlanStatusEnum,
  AgentActionStatusEnum,
  AgentToolNameEnum,
  AgentToolName,
  getDeterministicToolRiskTier,
  validateToolParameters,
  validatePlanActionCount,
  verifyConfirmationBinding,
  isActionExecutable,
  evaluateAgentOwnershipAndPermission,
  evaluateEmergencyPrecedence,
  evaluateConfirmationEmergencyPrecedence,
  createProhibitedRefusal,
  MAX_ACTIONS_PER_PLAN,
  AgentActionConfirmRequestSchema,
  AgentActionCancelRequestSchema,
  AgentPlanRequestSchema,
  AgentPlanResponseSchema,
  AgentProhibitedRefusalSchema,
  ToolScheduleCareTaskParamsSchema,
  ToolScheduleReminderParamsSchema,
  ToolRequestAppointmentParamsSchema,
  ToolLogLifestyleRecordParamsSchema,
  ToolDraftCareProposalParamsSchema,
  ToolQueryHealthSummaryParamsSchema,
  ProhibitedClinicalActionCategoryEnum,
  AGENT_TOOL_REQUIRED_PERMISSIONS,
  CaregiverPermission,
} from '@aarogyadamu/contracts';

describe('P0.7.1 Agentic Execution Contracts & Governance', () => {
  // ==========================================
  // 1. TOOL REGISTRY & RISK-TIER MAPPING
  // ==========================================
  describe('1. Allowlisted Tool Registry & Deterministic Risk-Tier Mapping', () => {
    it('verifies all 6 allowlisted tools are present in AgentToolNameEnum', () => {
      const allowedTools = AgentToolNameEnum.options;
      expect(allowedTools).toHaveLength(6);
      expect(allowedTools).toContain('tool_schedule_care_task');
      expect(allowedTools).toContain('tool_schedule_reminder');
      expect(allowedTools).toContain('tool_request_appointment');
      expect(allowedTools).toContain('tool_log_lifestyle_record');
      expect(allowedTools).toContain('tool_draft_care_proposal');
      expect(allowedTools).toContain('tool_query_health_summary');
    });

    it('maps read-only summary query to LOW_RISK', () => {
      expect(getDeterministicToolRiskTier('tool_query_health_summary')).toBe('LOW_RISK');
    });

    it('maps scheduling and lifestyle mutation tools to MEDIUM_RISK', () => {
      expect(getDeterministicToolRiskTier('tool_schedule_care_task')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_schedule_reminder')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_request_appointment')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_log_lifestyle_record')).toBe('MEDIUM_RISK');
    });

    it('maps clinical care proposals to HIGH_RISK', () => {
      expect(getDeterministicToolRiskTier('tool_draft_care_proposal')).toBe('HIGH_RISK');
    });

    it('throws error for unrecognized or prohibited tool names', () => {
      expect(() => getDeterministicToolRiskTier('tool_prescribe_medication' as any)).toThrow(
        /Unrecognized agent tool name/i,
      );
      expect(() => getDeterministicToolRiskTier('tool_adjust_insulin' as any)).toThrow(
        /Unrecognized agent tool name/i,
      );
    });
  });

  // ==========================================
  // 2. STRICT PARAMETER VALIDATION (ZOD STRICTNESS)
  // ==========================================
  describe('2. Strict Parameter Validation & Boundary Enforcement', () => {
    it('validates tool_schedule_care_task with valid parameters', () => {
      const valid = {
        title: 'Check fasting blood glucose',
        category: 'GLUCOSE_CHECK',
        dueAt: '2026-11-04T08:00:00.000Z',
        carePlanId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        notes: 'Pre-breakfast check',
      };
      const parsed = validateToolParameters('tool_schedule_care_task', valid);
      expect(parsed.title).toBe('Check fasting blood glucose');
      expect(parsed.category).toBe('GLUCOSE_CHECK');
    });

    it('rejects tool_schedule_care_task when unrecognized properties are injected', () => {
      const malicious = {
        title: 'Check blood glucose',
        category: 'GLUCOSE_CHECK',
        dueAt: '2026-11-04T08:00:00.000Z',
        injectedScript: '<script>alert(1)</script>',
        autoConfirm: true,
      };
      expect(() => validateToolParameters('tool_schedule_care_task', malicious)).toThrow();
    });

    it('validates tool_schedule_reminder with valid recurrence', () => {
      const valid = {
        title: 'Evening Metformin reminder',
        category: 'MEDICATION',
        remindAt: '2026-11-04T20:00:00.000Z',
        recurrence: 'DAILY',
        notes: 'Take with dinner',
      };
      const parsed = validateToolParameters('tool_schedule_reminder', valid);
      expect(parsed.recurrence).toBe('DAILY');
    });

    it('validates tool_request_appointment and enforces duration boundaries', () => {
      const valid = {
        doctorId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        scheduledAt: '2026-11-10T10:00:00.000Z',
        durationMinutes: 45,
        reason: 'Quarterly diabetic retinopathy and HbA1c review',
        visitType: 'CHECKUP',
      };
      const parsed = validateToolParameters('tool_request_appointment', valid);
      expect(parsed.durationMinutes).toBe(45);

      // Duration < 15 must fail
      expect(() =>
        validateToolParameters('tool_request_appointment', { ...valid, durationMinutes: 10 }),
      ).toThrow();

      // Duration > 120 must fail
      expect(() =>
        validateToolParameters('tool_request_appointment', { ...valid, durationMinutes: 150 }),
      ).toThrow();
    });

    it('validates tool_log_lifestyle_record and rejects negative numbers', () => {
      const valid = {
        category: 'PHYSICAL_ACTIVITY',
        numericValue: 45,
        unit: 'MINUTES',
        qualitativeValue: 'MODERATE_WALK',
        notes: 'Brisk evening walk in park',
      };
      const parsed = validateToolParameters('tool_log_lifestyle_record', valid);
      expect(parsed.numericValue).toBe(45);

      // Negative value must fail
      expect(() =>
        validateToolParameters('tool_log_lifestyle_record', { ...valid, numericValue: -15 }),
      ).toThrow();
    });

    it('validates tool_draft_care_proposal and enforces clinical rationale length', () => {
      const valid = {
        proposalType: 'MEDICATION_ADJUSTMENT_REQUEST',
        title: 'Review Metformin dosage due to gastrointestinal intolerance',
        rationale: 'Patient reports persistent nausea and bloating following dosage increase.',
        proposedDetails: { currentDosage: '1000mg BID', suggestedAction: 'Consider extended release formulation' },
      };
      const parsed = validateToolParameters('tool_draft_care_proposal', valid);
      expect(parsed.proposalType).toBe('MEDICATION_ADJUSTMENT_REQUEST');

      // Short rationale (< 10 chars) must fail
      expect(() =>
        validateToolParameters('tool_draft_care_proposal', { ...valid, rationale: 'too short' }),
      ).toThrow();
    });

    it('validates tool_query_health_summary and bounds timeRangeDays', () => {
      const valid = {
        metric: 'BLOOD_GLUCOSE',
        timeRangeDays: 14,
      };
      const parsed = validateToolParameters('tool_query_health_summary', valid);
      expect(parsed.timeRangeDays).toBe(14);

      // Range > 90 days must fail
      expect(() =>
        validateToolParameters('tool_query_health_summary', { ...valid, timeRangeDays: 120 }),
      ).toThrow();
    });
  });

  // ==========================================
  // 3. ACTION CEILING (MAX 3 ACTIONS PER PLAN)
  // ==========================================
  describe('3. Action Ceiling & Plan Bounding (Maximum 3 Actions Per Plan)', () => {
    it('defines MAX_ACTIONS_PER_PLAN as exactly 3', () => {
      expect(MAX_ACTIONS_PER_PLAN).toBe(3);
    });

    it('accepts plans with 0, 1, 2, or 3 actions', () => {
      expect(validatePlanActionCount([]).valid).toBe(true);
      expect(validatePlanActionCount([{ id: '1' }]).valid).toBe(true);
      expect(validatePlanActionCount([{ id: '1' }, { id: '2' }]).valid).toBe(true);
      expect(validatePlanActionCount([{ id: '1' }, { id: '2' }, { id: '3' }]).valid).toBe(true);
    });

    it('strictly rejects plans attempting to execute 4 or more actions', () => {
      const actions = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }];
      const result = validatePlanActionCount(actions);
      expect(result.valid).toBe(false);
      expect(result.count).toBe(4);
      expect(result.error).toMatch(/Action limit exceeded/i);
    });

    it('AgentPlanResponseSchema rejects payloads with more than 3 actions', () => {
      const mockAction = {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planVersion: 1,
        toolName: 'tool_schedule_care_task',
        parameters: { title: 'Test Task', dueAt: '2026-11-04T08:00:00.000Z' },
        riskTier: 'MEDIUM_RISK',
        status: 'AWAITING_CONFIRMATION',
        summary: 'Schedule test task',
        requiresPatientConfirmation: true,
        requiresClinicianApproval: false,
        idempotencyKey: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        expiresAt: '2026-11-05T08:00:00.000Z',
        createdAt: '2026-11-04T08:00:00.000Z',
      };

      const validPlan = {
        planId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planVersion: 1,
        userId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        targetPatientId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        status: 'AWAITING_CONFIRMATION',
        userIntent: 'SCHEDULE_FOLLOW_UP',
        explanation: 'Plan to schedule follow-up appointments',
        actions: [mockAction, mockAction, mockAction],
        requiresConfirmation: true,
        requiresClinicianApproval: false,
        highestRiskTier: 'MEDIUM_RISK',
        expiresAt: '2026-11-05T08:00:00.000Z',
        createdAt: '2026-11-04T08:00:00.000Z',
      };

      expect(() => AgentPlanResponseSchema.parse(validPlan)).not.toThrow();

      // Adding a 4th action must fail Zod schema validation
      const invalidPlan = {
        ...validPlan,
        actions: [...validPlan.actions, mockAction],
      };
      expect(() => AgentPlanResponseSchema.parse(invalidPlan)).toThrow(/cannot exceed 3 actions/i);
    });
  });

  // ==========================================
  // 4. CONFIRMATION BINDING CONTRACTS (SEC-P0.7-06)
  // ==========================================
  describe('4. Confirmation Binding & Anti-Tampering Contracts', () => {
    const expectedBinding = {
      actionId: 'act-1234',
      planId: 'plan-5678',
      planVersion: 2,
      planOwnerUserId: 'patient-primary-001',
    };

    it('accepts exact match of actionId, planId, planVersion, and planOwnerUserId', () => {
      const actual = {
        actionId: 'act-1234',
        planId: 'plan-5678',
        planVersion: 2,
        confirmedByUserId: 'patient-primary-001',
      };
      const res = verifyConfirmationBinding(expectedBinding, actual);
      expect(res.bound).toBe(true);
      expect(res.mismatchReason).toBeUndefined();
    });

    it('rejects actionId mismatch', () => {
      const actual = { actionId: 'act-9999', planId: 'plan-5678', planVersion: 2 };
      const res = verifyConfirmationBinding(expectedBinding, actual);
      expect(res.bound).toBe(false);
      expect(res.mismatchReason).toMatch(/Action ID mismatch/i);
    });

    it('rejects planId mismatch', () => {
      const actual = { actionId: 'act-1234', planId: 'plan-9999', planVersion: 2 };
      const res = verifyConfirmationBinding(expectedBinding, actual);
      expect(res.bound).toBe(false);
      expect(res.mismatchReason).toMatch(/Plan ID mismatch/i);
    });

    it('rejects planVersion mismatch (stale confirmation replay attempt)', () => {
      const actual = { actionId: 'act-1234', planId: 'plan-5678', planVersion: 1 };
      const res = verifyConfirmationBinding(expectedBinding, actual);
      expect(res.bound).toBe(false);
      expect(res.mismatchReason).toMatch(/Plan version mismatch.*Stale confirmation rejected/i);
    });

    it('rejects confirmation actor mismatch (SEC-P0.7-06: actor binding check)', () => {
      const actual = {
        actionId: 'act-1234',
        planId: 'plan-5678',
        planVersion: 2,
        confirmedByUserId: 'unauthorized-intruder-009',
      };
      const res = verifyConfirmationBinding(expectedBinding, actual);
      expect(res.bound).toBe(false);
      expect(res.mismatchReason).toMatch(/Confirmation actor mismatch/i);
    });

    it('AgentActionConfirmRequestSchema strictly requires confirm: true and valid UUIDs', () => {
      const valid = {
        actionId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planVersion: 1,
        confirm: true,
        idempotencyKey: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      };
      expect(() => AgentActionConfirmRequestSchema.parse(valid)).not.toThrow();

      // confirm: false must fail schema
      expect(() =>
        AgentActionConfirmRequestSchema.parse({ ...valid, confirm: false }),
      ).toThrow();
    });

    it('AgentActionCancelRequestSchema requires cancellation reason', () => {
      const valid = {
        actionId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        planId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        reason: 'User changed mind about appointment time',
      };
      expect(() => AgentActionCancelRequestSchema.parse(valid)).not.toThrow();

      // Empty reason must fail
      expect(() =>
        AgentActionCancelRequestSchema.parse({ ...valid, reason: '  ' }),
      ).toThrow();
    });
  });

  // ==========================================
  // 5. EXECUTABLE STATE, PATHWAYS & INTEGRITY MATRIX (SEC-P0.7-01, SEC-P0.7-02, SEC-P0.7-05)
  // ==========================================
  describe('5. Action Executability & Non-Executable States Matrix', () => {
    const referenceTime = new Date('2026-11-03T12:00:00.000Z');
    const futureTime = new Date('2026-11-04T12:00:00.000Z');
    const pastTime = new Date('2026-11-02T12:00:00.000Z');

    it('permits execution for unexpired AWAITING_CONFIRMATION actions via PATIENT_CONFIRMATION', () => {
      const action = {
        status: 'AWAITING_CONFIRMATION' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable({
        action,
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(true);
    });

    it('SEC-P0.7-01 CRITICAL: strictly rejects execution of actions in DRAFT status', () => {
      const action = {
        status: 'DRAFT' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable({
        action,
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_NOT_IN_EXECUTABLE_STATE');
      expect(res.reason).toMatch(/DRAFT status are unproposed and cannot be executed/i);
    });

    it('SEC-P0.7-02 CRITICAL: rejects PENDING_CLINICIAN_APPROVAL when invoked via PATIENT_CONFIRMATION pathway', () => {
      const action = {
        status: 'PENDING_CLINICIAN_APPROVAL' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable({
        action,
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_REQUIRES_CLINICIAN_APPROVAL');
      expect(res.reason).toMatch(/cannot be executed through patient confirmation/i);
    });

    it('SEC-P0.7-02: permits execution of PENDING_CLINICIAN_APPROVAL when approved via CLINICIAN_APPROVAL pathway', () => {
      const action = {
        status: 'PENDING_CLINICIAN_APPROVAL' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable({
        action,
        pathway: 'CLINICIAN_APPROVAL',
        referenceTime,
      });
      expect(res.executable).toBe(true);
    });

    it('SEC-P0.7-02: rejects AWAITING_CONFIRMATION when attempted via CLINICIAN_APPROVAL pathway', () => {
      const action = {
        status: 'AWAITING_CONFIRMATION' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable({
        action,
        pathway: 'CLINICIAN_APPROVAL',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_AWAITING_PATIENT_CONFIRMATION');
    });

    it('SEC-P0.7-05: rejects child action execution when parent plan is CANCELLED', () => {
      const res = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'CANCELLED', expiresAt: futureTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('PARENT_PLAN_CANCELLED');
    });

    it('SEC-P0.7-05: rejects child action execution when parent plan is EXPIRED', () => {
      const res = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'EXPIRED', expiresAt: pastTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('PARENT_PLAN_EXPIRED');
    });

    it('SEC-P0.7-05: rejects child action execution when parent plan has expired temporally', () => {
      const res = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'AWAITING_CONFIRMATION', expiresAt: pastTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('PARENT_PLAN_EXPIRED');
    });

    it('SEC-P0.7-05: rejects child action execution when parent plan is EMERGENCY_ABORTED', () => {
      const res = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'EMERGENCY_ABORTED', expiresAt: futureTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(res.executable).toBe(false);
      expect(res.code).toBe('PARENT_PLAN_EMERGENCY_ABORTED');
    });

    it('SEC-P0.7-05: rejects child action execution when parent plan is FAILED or PROHIBITED', () => {
      const resFailed = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'FAILED', expiresAt: futureTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(resFailed.executable).toBe(false);
      expect(resFailed.code).toBe('PARENT_PLAN_FAILED');

      const resProhibited = isActionExecutable({
        action: { status: 'AWAITING_CONFIRMATION', expiresAt: futureTime },
        parentPlan: { status: 'PROHIBITED_REFUSED', expiresAt: futureTime },
        pathway: 'PATIENT_CONFIRMATION',
        referenceTime,
      });
      expect(resProhibited.executable).toBe(false);
      expect(resProhibited.code).toBe('PARENT_PLAN_PROHIBITED');
    });

    it('rejects execution when action is already COMPLETED', () => {
      const action = {
        status: 'COMPLETED' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_ALREADY_EXECUTED');
    });

    it('rejects execution when action is CANCELLED', () => {
      const action = {
        status: 'CANCELLED' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_CANCELLED');
    });

    it('rejects execution when action is REJECTED', () => {
      const action = {
        status: 'REJECTED' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_REJECTED');
    });

    it('rejects execution when action is actively EXECUTING', () => {
      const action = {
        status: 'EXECUTING' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_IN_PROGRESS');
    });

    it('rejects execution when action is PROHIBITED_REFUSED', () => {
      const action = {
        status: 'PROHIBITED_REFUSED' as const,
        expiresAt: futureTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_PROHIBITED');
    });

    it('rejects execution when AWAITING_CONFIRMATION action has expired', () => {
      const action = {
        status: 'AWAITING_CONFIRMATION' as const,
        expiresAt: pastTime,
      };
      const res = isActionExecutable(action, referenceTime);
      expect(res.executable).toBe(false);
      expect(res.code).toBe('ACTION_EXPIRED');
    });
  });

  // ==========================================
  // 6. PATIENT OWNERSHIP, CLINICIAN ASSIGNMENT & GRANULAR CAREGIVER PERMISSIONS (SEC-P0.7-03, SEC-P0.7-04)
  // ==========================================
  describe('6. Patient Ownership, Clinician Assignment & Granular Caregiver Permissions', () => {
    const patientId = 'patient-001';
    const caregiverId = 'caregiver-002';
    const doctorId = 'doctor-003';
    const referenceTime = new Date('2026-11-03T12:00:00.000Z');

    it('authorizes direct patient self-access without caregiver consent requirement', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: patientId,
        targetPatientId: patientId,
        actorRole: 'PATIENT',
        toolName: 'tool_schedule_care_task',
      });
      expect(res.authorized).toBe(true);
    });

    it('SEC-P0.7-03: authorizes clinician access when active DoctorPatientAssignment exists', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: doctorId,
        targetPatientId: patientId,
        actorRole: 'CLINICIAN',
        toolName: 'tool_draft_care_proposal',
        hasActiveDoctorAssignment: true,
      });
      expect(res.authorized).toBe(true);
    });

    it('SEC-P0.7-03: strictly rejects clinician access when DoctorPatientAssignment is missing or inactive', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: doctorId,
        targetPatientId: patientId,
        actorRole: 'CLINICIAN',
        toolName: 'tool_draft_care_proposal',
        hasActiveDoctorAssignment: false,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('UNASSIGNED_CLINICIAN');
      expect(res.reason).toMatch(/does not have an active DoctorPatientAssignment/i);
    });

    it('SEC-P0.7-03: strictly blocks ADMIN role from executing clinical agent actions', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: 'admin-007',
        targetPatientId: patientId,
        actorRole: 'ADMIN',
        toolName: 'tool_draft_care_proposal',
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('ADMIN_CLINICAL_ACTION_NOT_PERMITTED');
    });

    it('SEC-P0.7-04: verifies exact mappings in AGENT_TOOL_REQUIRED_PERMISSIONS', () => {
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_query_health_summary).toBe('VIEW_OBSERVATIONS');
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_schedule_care_task).toBe('MANAGE_TASKS');
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_schedule_reminder).toBe('MANAGE_REMINDERS');
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_request_appointment).toBe('MANAGE_CONSULTATIONS');
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_log_lifestyle_record).toBe('MANAGE_LIFESTYLE');
      expect(AGENT_TOOL_REQUIRED_PERMISSIONS.tool_draft_care_proposal).toBe('VIEW_CARE_PLAN');
    });

    it('SEC-P0.7-04: authorizes caregiver with exact granular MANAGE_REMINDERS permission for reminders', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_reminder',
        caregiverPermissions: ['MANAGE_REMINDERS'],
        consentActive: true,
        referenceTime,
      });
      expect(res.authorized).toBe(true);
      expect(res.requiredPermission).toBe('MANAGE_REMINDERS');
    });

    it('SEC-P0.7-04: rejects caregiver when MANAGE_TASKS is present but MANAGE_REMINDERS is missing', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_reminder',
        caregiverPermissions: ['MANAGE_TASKS'], // Only tasks, not reminders!
        consentActive: true,
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
      expect(res.requiredPermission).toBe('MANAGE_REMINDERS');
    });

    it('SEC-P0.7-04: rejects caregiver when attempting appointment request without MANAGE_CONSULTATIONS', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_request_appointment',
        caregiverPermissions: ['MANAGE_TASKS', 'MANAGE_REMINDERS'],
        consentActive: true,
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
      expect(res.requiredPermission).toBe('MANAGE_CONSULTATIONS');
    });

    it('SEC-P0.7-04: rejects caregiver when attempting lifestyle log without MANAGE_LIFESTYLE', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_log_lifestyle_record',
        caregiverPermissions: ['MANAGE_TASKS'],
        consentActive: true,
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
      expect(res.requiredPermission).toBe('MANAGE_LIFESTYLE');
    });

    it('SEC-P0.7-04: rejects caregiver when attempting care proposal drafting without VIEW_CARE_PLAN', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_draft_care_proposal',
        caregiverPermissions: ['MANAGE_TASKS'],
        consentActive: true,
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
      expect(res.requiredPermission).toBe('VIEW_CARE_PLAN');
    });

    it('authorizes caregiver with active consent and MANAGE_TASKS permission for task tools', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_care_task',
        caregiverPermissions: ['MANAGE_TASKS', 'VIEW_OBSERVATIONS'],
        consentActive: true,
        consentExpiresAt: new Date('2026-12-01T00:00:00.000Z'),
        referenceTime,
      });
      expect(res.authorized).toBe(true);
    });

    it('rejects caregiver when caregiver consent is inactive or revoked', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_care_task',
        caregiverPermissions: ['MANAGE_TASKS'],
        consentActive: false,
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('CAREGIVER_CONSENT_INACTIVE');
    });

    it('rejects caregiver when caregiver consent has expired', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: caregiverId,
        targetPatientId: patientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_care_task',
        caregiverPermissions: ['MANAGE_TASKS'],
        consentActive: true,
        consentExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
        referenceTime,
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('CAREGIVER_CONSENT_EXPIRED');
    });

    it('rejects cross-patient access when actor is another patient', () => {
      const res = evaluateAgentOwnershipAndPermission({
        actorId: 'patient-999',
        targetPatientId: patientId,
        actorRole: 'PATIENT',
        toolName: 'tool_schedule_care_task',
      });
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });
  });

  // ==========================================
  // 7. EMERGENCY PRECEDENCE INTERFACE & CONFIRMATION SAFEGUARDS
  // ==========================================
  describe('7. Emergency Precedence Interface That Halts Agent Execution', () => {
    it('immediately triggers EMERGENCY_HALT when emergencyNotice is present', () => {
      const emergencyNotice = 'CRITICAL NOTICE: Severe hypoglycemia detected. Call 112/108 immediately.';
      const res = evaluateEmergencyPrecedence(emergencyNotice);
      expect(res.hasEmergency).toBe(true);
      expect(res.decision).toBe('EMERGENCY_HALT');
      expect(res.haltReason).toMatch(/Emergency condition detected/i);
      expect(res.emergencyNotice).toBe(emergencyNotice);
    });

    it('immediately triggers EMERGENCY_HALT when detected glucose is < 54 mg/dL', () => {
      const res = evaluateEmergencyPrecedence(undefined, 42);
      expect(res.hasEmergency).toBe(true);
      expect(res.decision).toBe('EMERGENCY_HALT');
      expect(res.haltReason).toMatch(/Acute hypoglycemia \(< 54 mg\/dL\)/i);
    });

    it('allows STANDARD_EXECUTION when no emergency notice or acute hypoglycemia is present', () => {
      const res = evaluateEmergencyPrecedence(undefined, 110);
      expect(res.hasEmergency).toBe(false);
      expect(res.decision).toBe('STANDARD_EXECUTION');
      expect(res.haltReason).toBeUndefined();
    });

    describe('evaluateConfirmationEmergencyPrecedence', () => {
      it('halts confirmation immediately if severe hypoglycemia (<54 mg/dL) is present', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          currentGlucose: 48,
        });
        expect(res.hasEmergency).toBe(true);
        expect(res.decision).toBe('EMERGENCY_HALT');
        expect(res.haltReason).toMatch(/Acute hypoglycemia/i);
      });

      it('halts confirmation immediately if emergency notice is passed', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          emergencyNotice: 'Emergency alert active from P0.6 evaluator',
        });
        expect(res.hasEmergency).toBe(true);
        expect(res.decision).toBe('EMERGENCY_HALT');
      });

      it('halts confirmation immediately if patient speaks critical symptoms (e.g. chest pain)', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          spokenOrTextInput: 'I confirm the task but I have severe chest pain right now',
        });
        expect(res.hasEmergency).toBe(true);
        expect(res.decision).toBe('EMERGENCY_HALT');
        expect(res.detectedSymptoms).toContain('chest pain');
      });

      it('halts confirmation immediately if patient mentions fainting or seizure', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          spokenOrTextInput: 'yes book it but my daughter fainted earlier',
        });
        expect(res.hasEmergency).toBe(true);
        expect(res.decision).toBe('EMERGENCY_HALT');
        expect(res.detectedSymptoms).toContain('fainted');
      });

      it('halts confirmation immediately if patient mentions unable to swallow or choking', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          spokenOrTextInput: 'confirm appointment, but I am unable to swallow my pills',
        });
        expect(res.hasEmergency).toBe(true);
        expect(res.decision).toBe('EMERGENCY_HALT');
        expect(res.detectedSymptoms).toContain('unable to swallow');
      });

      it('allows confirmation execution when spoken confirmation is benign', () => {
        const res = evaluateConfirmationEmergencyPrecedence({
          spokenOrTextInput: 'Yes, please schedule my morning blood glucose check.',
          currentGlucose: 125,
        });
        expect(res.hasEmergency).toBe(false);
        expect(res.decision).toBe('STANDARD_EXECUTION');
      });
    });
  });

  // ==========================================
  // 8. PROHIBITED CLINICAL-ACTION REFUSAL CONTRACTS
  // ==========================================
  describe('8. Prohibited Clinical-Action Refusal Contracts', () => {
    it('verifies all prohibited clinical categories are defined', () => {
      const categories = ProhibitedClinicalActionCategoryEnum.options;
      expect(categories).toContain('PRESCRIBE_MEDICATION');
      expect(categories).toContain('ADJUST_INSULIN_DOSE');
      expect(categories).toContain('MODIFY_MEDICATION_DOSE');
      expect(categories).toContain('INDEPENDENT_DIAGNOSIS');
      expect(categories).toContain('CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR');
      expect(categories).toContain('DELETE_OBSERVATION_HISTORY');
      expect(categories).toContain('BYPASS_CAREGIVER_CONSENT');
    });

    it('generates deterministic refusal for PRESCRIBE_MEDICATION', () => {
      const refusal = createProhibitedRefusal('PRESCRIBE_MEDICATION');
      expect(refusal.isProhibited).toBe(true);
      expect(refusal.refusalCode).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(refusal.category).toBe('PRESCRIBE_MEDICATION');
      expect(refusal.refusalReason).toMatch(/Prescribing medications is strictly prohibited/i);
      expect(refusal.suggestedAction).toBe('CONSULT_TREATING_PHYSICIAN');
      expect(() => AgentProhibitedRefusalSchema.parse(refusal)).not.toThrow();
    });

    it('generates deterministic refusal for ADJUST_INSULIN_DOSE', () => {
      const refusal = createProhibitedRefusal('ADJUST_INSULIN_DOSE');
      expect(refusal.isProhibited).toBe(true);
      expect(refusal.category).toBe('ADJUST_INSULIN_DOSE');
      expect(refusal.refusalReason).toMatch(/Adjusting insulin units or regimens carries acute hypoglycemia risk/i);
      expect(() => AgentProhibitedRefusalSchema.parse(refusal)).not.toThrow();
    });

    it('generates deterministic refusal for INDEPENDENT_DIAGNOSIS', () => {
      const refusal = createProhibitedRefusal('INDEPENDENT_DIAGNOSIS');
      expect(refusal.isProhibited).toBe(true);
      expect(refusal.category).toBe('INDEPENDENT_DIAGNOSIS');
      expect(refusal.refusalReason).toMatch(/Damu cannot provide diagnostic conclusions/i);
      expect(() => AgentProhibitedRefusalSchema.parse(refusal)).not.toThrow();
    });
  });

  // ==========================================
  // 9. ADVERSARIAL & RED-TEAM CONTRACT ATTACKS
  // ==========================================
  describe('9. Adversarial & Red-Team Contract Attacks', () => {
    it('rejects prototype pollution attempts in tool parameters', () => {
      const malicious = JSON.parse('{"title": "Check feet", "__proto__": {"isAdmin": true}, "dueAt": "2026-11-04T08:00:00.000Z"}');
      expect(() => validateToolParameters('tool_schedule_care_task', malicious)).toThrow();
    });

    it('rejects prompt injection payload in ToolRequestAppointment', () => {
      const attack = {
        doctorId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        scheduledAt: '2026-11-10T10:00:00.000Z',
        durationMinutes: 30,
        reason: 'Normal visit',
        visitType: 'CHECKUP',
        overridePermissions: true,
        escalateToAdmin: true,
      };
      expect(() => validateToolParameters('tool_request_appointment', attack)).toThrow();
    });

    it('rejects negative durations or non-integer minutes in appointment requests', () => {
      const attack = {
        doctorId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        scheduledAt: '2026-11-10T10:00:00.000Z',
        durationMinutes: -30,
        reason: 'Malicious appointment duration',
      };
      expect(() => validateToolParameters('tool_request_appointment', attack)).toThrow();
    });

    it('rejects execution attempt when actor spoofing targetPatientId is attempted without authorization', () => {
      const attack = {
        actorId: 'attacker-uuid',
        targetPatientId: 'victim-uuid',
        actorRole: 'CAREGIVER' as const,
        toolName: 'tool_log_lifestyle_record' as const,
        caregiverPermissions: [],
        consentActive: false,
      };
      const res = evaluateAgentOwnershipAndPermission(attack);
      expect(res.authorized).toBe(false);
      expect(res.errorCode).toBe('CAREGIVER_CONSENT_INACTIVE');
    });
  });
});
