import crypto from 'crypto';
import {
  AgentActionConfirmRequestSchema,
  AgentPlanResponseSchema,
  verifyConfirmationBinding,
  isActionExecutable,
  evaluateAgentOwnershipAndPermission,
  evaluateConfirmationEmergencyPrecedence,
  getDeterministicToolRiskTier,
} from '@aarogyadamu/contracts';
import { formatAgentPlan } from '../ai/agent/agentPlanner';
import { classifyAgentIntent } from '../ai/agent/intentClassifier';
import { validateRegisteredToolParameters, isAllowlistedTool } from '../ai/agent/toolRegistry';
import { executeAgentTool, ToolExecutionContext } from '../ai/agent/toolExecutor';

describe('Governed Agent Confirmation & Fasting Blood Glucose Task Execution', () => {
  const mockPatientId = '11111111-1111-4111-8111-111111111111';
  const mockDoctorId = '22222222-2222-4222-8222-222222222222';
  const mockCaregiverId = '33333333-3333-4333-8333-333333333333';
  const mockOtherPatientId = '44444444-4444-4444-8444-444444444444';
  const mockPlanId = '55555555-5555-4555-8555-555555555555';
  const mockActionId = '66666666-6666-4666-8666-666666666666';

  // =========================================================================
  // 1. Zod Confirmation Payload Contract Validation
  // =========================================================================
  describe('1. Zod Confirmation Payload Schema Validation', () => {
    it('accepts valid full confirmation payload including actionId, planId, planVersion, and idempotencyKey', () => {
      const validPayload = {
        actionId: mockActionId,
        planId: mockPlanId,
        planVersion: 1,
        confirm: true,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      };

      const parsed = AgentActionConfirmRequestSchema.parse(validPayload);
      expect(parsed.confirm).toBe(true);
      expect(parsed.planId).toBe(mockPlanId);
      expect(parsed.planVersion).toBe(1);
      expect(parsed.idempotencyKey).toBe('77777777-7777-4777-8777-777777777777');
    });

    it('accepts confirmation payload when planId and planVersion are omitted, defaulting planVersion to 1', () => {
      // Regression test for the "Input validation failed" bug:
      // When client serializes payload without planId or planVersion, schema must not fail
      const payloadWithoutPlan = {
        confirm: true,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      };

      const parsed = AgentActionConfirmRequestSchema.parse(payloadWithoutPlan);
      expect(parsed.confirm).toBe(true);
      expect(parsed.planVersion).toBe(1);
      expect(parsed.planId).toBeUndefined();
    });

    it('strictly rejects payload when confirm is false', () => {
      const invalid = {
        planId: mockPlanId,
        planVersion: 1,
        confirm: false,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
      };

      expect(() => AgentActionConfirmRequestSchema.parse(invalid)).toThrow(
        /Explicit confirmation flag true is required/i,
      );
    });

    it('strictly rejects invalid non-UUID idempotency keys', () => {
      const invalid = {
        confirm: true,
        idempotencyKey: 'not-a-valid-uuid',
      };

      expect(() => AgentActionConfirmRequestSchema.parse(invalid)).toThrow(
        /idempotencyKey must be a valid UUID/i,
      );
    });

    it('strictly rejects unrecognized injected fields (strict mode)', () => {
      const polluted = {
        confirm: true,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
        injectedRole: 'ADMIN',
        bypassConfirmation: true,
      };

      expect(() => AgentActionConfirmRequestSchema.parse(polluted)).toThrow();
    });
  });

  // =========================================================================
  // 2. Confirmation Binding & Anti-Tampering Verification
  // =========================================================================
  describe('2. Confirmation Binding & Anti-Tampering Verification', () => {
    const expected = {
      actionId: mockActionId,
      planId: mockPlanId,
      planVersion: 1,
      planOwnerUserId: mockPatientId,
    };

    it('binds successfully when actual matches expected perfectly', () => {
      const result = verifyConfirmationBinding(expected, {
        actionId: mockActionId,
        planId: mockPlanId,
        planVersion: 1,
        confirmedByUserId: mockPatientId,
      });

      expect(result.bound).toBe(true);
      expect(result.mismatchReason).toBeUndefined();
    });

    it('binds successfully when planId and planVersion are omitted by client', () => {
      const result = verifyConfirmationBinding(expected, {
        actionId: mockActionId,
        confirmedByUserId: mockPatientId,
      });

      expect(result.bound).toBe(true);
    });

    it('rejects binding when planId is provided but does not match expected planId', () => {
      const wrongPlanId = '88888888-8888-4888-8888-888888888888';
      const result = verifyConfirmationBinding(expected, {
        actionId: mockActionId,
        planId: wrongPlanId,
        planVersion: 1,
      });

      expect(result.bound).toBe(false);
      expect(result.mismatchReason).toContain('Plan ID mismatch');
    });

    it('rejects binding when planVersion does not match expected version (stale replay prevention)', () => {
      const result = verifyConfirmationBinding(expected, {
        actionId: mockActionId,
        planId: mockPlanId,
        planVersion: 2, // stale or future version
      });

      expect(result.bound).toBe(false);
      expect(result.mismatchReason).toContain('Plan version mismatch');
    });

    it('rejects binding when actionId does not match expected actionId', () => {
      const wrongActionId = '99999999-9999-4999-8999-999999999999';
      const result = verifyConfirmationBinding(expected, {
        actionId: wrongActionId,
      });

      expect(result.bound).toBe(false);
      expect(result.mismatchReason).toContain('Action ID mismatch');
    });
  });

  // =========================================================================
  // 3. Plan Formatting & Contract Harmonization (Prisma -> Client Contract)
  // =========================================================================
  describe('3. Plan Formatting & Contract Harmonization', () => {
    it('formatAgentPlan formats raw Prisma entity to include both id and planId, version and planVersion', () => {
      const rawPrismaPlan = {
        id: mockPlanId,
        version: 1,
        userId: mockPatientId,
        targetPatientId: mockPatientId,
        status: 'AWAITING_CONFIRMATION',
        userIntent: 'SCHEDULE_CARE_TASK',
        explanation: 'Plan to schedule fasting blood glucose check.',
        highestRiskTier: 'MEDIUM_RISK',
        requiresConfirmation: true,
        requiresClinicianApproval: false,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        actions: [
          {
            id: mockActionId,
            planId: mockPlanId,
            planVersion: 1,
            toolName: 'tool_schedule_care_task',
            parameters: JSON.stringify({
              title: 'Morning Fasting Blood Glucose Check',
              category: 'GLUCOSE_CHECK',
              dueAt: new Date(Date.now() + 86400000).toISOString(),
              notes: 'Log fasting sugar level before breakfast',
            }),
            riskTier: 'MEDIUM_RISK',
            status: 'AWAITING_CONFIRMATION',
            summary: 'Schedule tomorrow morning fasting glucose check',
            requiresPatientConfirmation: true,
            requiresClinicianApproval: false,
            idempotencyKey: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
            expiresAt: new Date(Date.now() + 86400000),
            createdAt: new Date(),
          },
        ],
      };

      const formatted = formatAgentPlan(rawPrismaPlan);

      // Verify top-level plan properties
      expect(formatted.id).toBe(mockPlanId);
      expect(formatted.planId).toBe(mockPlanId);
      expect(formatted.version).toBe(1);
      expect(formatted.planVersion).toBe(1);
      expect(formatted.requiresConfirmation).toBe(true);
      expect(formatted.requiresClinicianApproval).toBe(false);

      // Verify actions array formatting
      expect(formatted.actions).toHaveLength(1);
      const action = formatted.actions[0];
      expect(action.id).toBe(mockActionId);
      expect(action.planId).toBe(mockPlanId);
      expect(action.planVersion).toBe(1);
      expect(typeof action.parameters).toBe('object');
      expect((action.parameters as any).title).toBe('Morning Fasting Blood Glucose Check');
      expect((action.parameters as any).category).toBe('GLUCOSE_CHECK');

      // Verify that formatted plan strictly passes AgentPlanResponseSchema
      const validated = AgentPlanResponseSchema.parse(formatted);
      expect(validated.planId).toBe(mockPlanId);
      expect(validated.actions[0].id).toBe(mockActionId);
    });
  });

  // =========================================================================
  // 4. "Plan to schedule fasting blood glucose check" Scenario
  // =========================================================================
  describe('4. "Plan to schedule fasting blood glucose check" Intent & Parameters', () => {
    it('classifies "Plan to schedule fasting blood glucose check." into tool_schedule_care_task', () => {
      const intentResult = classifyAgentIntent({
        userQuery: 'Plan to schedule fasting blood glucose check.',
      });

      expect(intentResult.hasEmergency).toBe(false);
      expect(intentResult.isProhibited).toBe(false);
      expect(intentResult.userIntent).toBe('SCHEDULE_CARE_TASK');
      expect(intentResult.explanation).toBe('Plan to schedule fasting blood glucose check.');

      expect(intentResult.candidateActions).toHaveLength(1);
      const action = intentResult.candidateActions[0];
      expect(action.toolName).toBe('tool_schedule_care_task');
      expect(action.summary).toContain('fasting glucose check');

      const params = action.parameters as any;
      expect(params.title).toBe('Morning Fasting Blood Glucose Check');
      expect(params.category).toBe('GLUCOSE_CHECK');
      expect(params.notes).toBe('Log fasting sugar level before breakfast');
      expect(new Date(params.dueAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('validates tool_schedule_care_task registered parameters against strict Zod schema', () => {
      const validParams = {
        title: 'Morning Fasting Blood Glucose Check',
        category: 'GLUCOSE_CHECK',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        notes: 'Log fasting sugar level before breakfast',
      };

      const parsed = validateRegisteredToolParameters('tool_schedule_care_task', validParams);
      expect(parsed.title).toBe('Morning Fasting Blood Glucose Check');
      expect(parsed.category).toBe('GLUCOSE_CHECK');
      expect(parsed.notes).toBe('Log fasting sugar level before breakfast');
    });

    it('assigns MEDIUM_RISK to tool_schedule_care_task', () => {
      expect(getDeterministicToolRiskTier('tool_schedule_care_task')).toBe('MEDIUM_RISK');
    });

    it('verifies tool_schedule_care_task is executable via PATIENT_CONFIRMATION when unexpired and AWAITING_CONFIRMATION', () => {
      const action = {
        status: 'AWAITING_CONFIRMATION' as const,
        expiresAt: new Date(Date.now() + 86400000),
      };

      const execCheck = isActionExecutable({
        action,
        pathway: 'PATIENT_CONFIRMATION',
      });

      expect(execCheck.executable).toBe(true);
    });
  });

  // =========================================================================
  // 5. Security & Boundary Guardrails
  // =========================================================================
  describe('5. Security, RBAC & Boundary Guardrails', () => {
    it('authorizes direct patient self-confirmation', () => {
      const auth = evaluateAgentOwnershipAndPermission({
        actorId: mockPatientId,
        targetPatientId: mockPatientId,
        actorRole: 'PATIENT',
        toolName: 'tool_schedule_care_task',
      });

      expect(auth.authorized).toBe(true);
    });

    it('strictly rejects cross-patient confirmation when patient A attempts to confirm patient B action', () => {
      const auth = evaluateAgentOwnershipAndPermission({
        actorId: mockOtherPatientId,
        targetPatientId: mockPatientId,
        actorRole: 'PATIENT',
        toolName: 'tool_schedule_care_task',
      });

      expect(auth.authorized).toBe(false);
      expect(auth.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('authorizes caregiver confirmation only when active consent and MANAGE_TASKS permission exist', () => {
      const authorizedCaregiver = evaluateAgentOwnershipAndPermission({
        actorId: mockCaregiverId,
        targetPatientId: mockPatientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_care_task',
        consentActive: true,
        caregiverPermissions: ['VIEW_HEALTH_SUMMARY', 'MANAGE_TASKS'],
      });

      expect(authorizedCaregiver.authorized).toBe(true);

      // Rejects caregiver when MANAGE_TASKS permission is missing
      const unauthorizedCaregiver = evaluateAgentOwnershipAndPermission({
        actorId: mockCaregiverId,
        targetPatientId: mockPatientId,
        actorRole: 'CAREGIVER',
        toolName: 'tool_schedule_care_task',
        consentActive: true,
        caregiverPermissions: ['VIEW_HEALTH_SUMMARY'], // missing MANAGE_TASKS
      });

      expect(unauthorizedCaregiver.authorized).toBe(false);
      expect(unauthorizedCaregiver.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
    });

    it('strictly prevents patient from confirming clinical care proposals (HIGH_RISK) directly', () => {
      const action = {
        status: 'PENDING_CLINICIAN_APPROVAL' as const,
        expiresAt: new Date(Date.now() + 86400000),
      };

      const execCheck = isActionExecutable({
        action,
        pathway: 'PATIENT_CONFIRMATION',
      });

      expect(execCheck.executable).toBe(false);
      expect(execCheck.code).toBe('ACTION_REQUIRES_CLINICIAN_APPROVAL');
    });

    it('halts confirmation immediately under emergency precedence if severe hypoglycemia is detected', () => {
      const emergencyEval = evaluateConfirmationEmergencyPrecedence({
        currentGlucose: 48, // acute severe hypoglycemia (<54 mg/dL)
      });

      expect(emergencyEval.hasEmergency).toBe(true);
      expect(emergencyEval.haltReason).toMatch(/hypoglycemia/i);
    });

    it('halts confirmation immediately if emergency notice or chest pain symptoms are spoken', () => {
      const emergencyEval = evaluateConfirmationEmergencyPrecedence({
        spokenOrTextInput: 'I confirm but I have sudden severe chest pain and trouble breathing',
      });

      expect(emergencyEval.hasEmergency).toBe(true);
      expect(emergencyEval.haltReason).toMatch(/critical symptom/i);
    });
  });
});
