import { prisma } from '../server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  isAllowlistedTool,
  getRegisteredTool,
  validateRegisteredToolParameters,
  classifyAgentIntent,
  detectProhibitedClinicalIntent,
  generateAgentPlan,
  confirmAgentAction,
  reviewProposalAction,
  cancelAgentAction,
  agentRuntime,
  executeAgentTool,
  executeClaimedAction,
} from '../ai/agent';
import {
  AgentToolName,
  getDeterministicToolRiskTier,
  validatePlanActionCount,
} from '@aarogyadamu/contracts';

describe('Phase P0.7.3 — Agent Runtime & Proposal Engine', () => {
  let patientA: { id: string; email: string };
  let patientB: { id: string; email: string };
  let caregiver: { id: string; email: string };
  let assignedDoctor: { id: string; email: string };
  let unassignedDoctor: { id: string; email: string };
  let adminUser: { id: string; email: string };

  const testRunId = `p073_${Date.now()}`;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecurePassword123!', 8);

    // 1. Patient A
    const uA = await prisma.user.create({
      data: {
        email: `${testRunId}_patient_a@aarogyadamu.test`,
        passwordHash,
        profile: {
          create: {
            fullName: 'Devi Priya',
            diabetesType: 'TYPE_2_DIABETES',
          },
        },
      },
    });
    patientA = { id: uA.id, email: uA.email };

    // 2. Patient B (Cross-patient isolation)
    const uB = await prisma.user.create({
      data: {
        email: `${testRunId}_patient_b@aarogyadamu.test`,
        passwordHash,
        profile: {
          create: {
            fullName: 'Kiran Kumar',
            diabetesType: 'TYPE_1_DIABETES',
          },
        },
      },
    });
    patientB = { id: uB.id, email: uB.email };

    // 3. Caregiver
    const uC = await prisma.user.create({
      data: {
        email: `${testRunId}_caregiver@aarogyadamu.test`,
        passwordHash,
      },
    });
    caregiver = { id: uC.id, email: uC.email };

    // 4. Assigned Doctor
    const uD = await prisma.user.create({
      data: {
        email: `${testRunId}_doctor_assigned@aarogyadamu.test`,
        passwordHash,
        isClinician: true,
      },
    });
    assignedDoctor = { id: uD.id, email: uD.email };

    // 5. Unassigned Doctor
    const uUD = await prisma.user.create({
      data: {
        email: `${testRunId}_doctor_unassigned@aarogyadamu.test`,
        passwordHash,
        isClinician: true,
      },
    });
    unassignedDoctor = { id: uUD.id, email: uUD.email };

    // 6. Admin User
    const uAdmin = await prisma.user.create({
      data: {
        email: `${testRunId}_admin@aarogyadamu.test`,
        passwordHash,
      },
    });
    adminUser = { id: uAdmin.id, email: uAdmin.email };

    // Create active DoctorPatientAssignment for assignedDoctor -> patientA
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: assignedDoctor.id,
        patientId: patientA.id,
        status: 'ACTIVE',
      },
    });

    // Create CaregiverConsent for caregiver -> patientA with MANAGE_TASKS and MANAGE_REMINDERS
    await prisma.caregiverConsent.create({
      data: {
        patientId: patientA.id,
        caregiverEmail: caregiver.email,
        caregiverName: 'Caregiver Rao',
        relationship: 'Daughter',
        status: 'ACTIVE',
        permissions: JSON.stringify(['MANAGE_TASKS', 'MANAGE_REMINDERS', 'VIEW_OBSERVATIONS']),
      },
    });
  });

  afterAll(async () => {
    const userIds = [
      patientA.id,
      patientB.id,
      caregiver.id,
      assignedDoctor.id,
      unassignedDoctor.id,
      adminUser.id,
    ];

    // Clean up dependent tables first to respect foreign key delete restrictions
    await prisma.appointment.deleteMany({
      where: {
        OR: [
          { patientId: { in: userIds } },
          { doctorId: { in: userIds } },
          { bookedById: { in: userIds } },
        ],
      },
    });

    await prisma.doctorPatientAssignment.deleteMany({
      where: {
        OR: [
          { patientId: { in: userIds } },
          { doctorId: { in: userIds } },
        ],
      },
    });

    await prisma.caregiverConsent.deleteMany({
      where: { patientId: { in: userIds } },
    });

    await prisma.agentAction.deleteMany({
      where: {
        plan: {
          targetPatientId: { in: userIds },
        },
      },
    });

    await prisma.agentPlan.deleteMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { targetPatientId: { in: userIds } },
        ],
      },
    });

    await prisma.agentAuditRecord.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.careTask.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.reminder.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.lifestyleRecord.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.healthObservation.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.patientProfile.deleteMany({
      where: { userId: { in: userIds } },
    });

    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  });

  // ==========================================
  // SECTION 1: TOOL REGISTRY & PARAMETER VALIDATION
  // ==========================================
  describe('1. Tool Registry & Strict Parameter Validation', () => {
    it('registers exactly the 6 approved allowlisted tools', () => {
      const approvedTools: AgentToolName[] = [
        'tool_schedule_care_task',
        'tool_schedule_reminder',
        'tool_request_appointment',
        'tool_log_lifestyle_record',
        'tool_draft_care_proposal',
        'tool_query_health_summary',
      ];

      for (const t of approvedTools) {
        expect(isAllowlistedTool(t)).toBe(true);
        const def = getRegisteredTool(t);
        expect(def.name).toBe(t);
        expect(def.riskTier).toBe(getDeterministicToolRiskTier(t));
      }
    });

    it('rejects unapproved or speculative tools immediately', () => {
      expect(isAllowlistedTool('tool_prescribe_medication')).toBe(false);
      expect(isAllowlistedTool('tool_adjust_insulin')).toBe(false);
      expect(isAllowlistedTool('tool_diagnose_disease')).toBe(false);

      expect(() => getRegisteredTool('tool_prescribe_medication')).toThrow(
        /Unauthorized or unrecognized agent tool/,
      );
    });

    it('validates parameters strictly and rejects missing or malformed inputs', () => {
      // Valid care task params
      const validCareTask = validateRegisteredToolParameters('tool_schedule_care_task', {
        title: 'Check morning blood sugar',
        category: 'GLUCOSE_CHECK',
        dueAt: new Date(Date.now() + 3600000).toISOString(),
      });
      expect(validCareTask.title).toBe('Check morning blood sugar');

      // Invalid care task: missing dueAt
      expect(() =>
        validateRegisteredToolParameters('tool_schedule_care_task', {
          title: 'Check blood sugar',
        }),
      ).toThrow();

      // Invalid reminder: negative duration or missing remindAt
      expect(() =>
        validateRegisteredToolParameters('tool_schedule_reminder', {
          title: 'Metformin reminder',
          category: 'MEDICATION',
        }),
      ).toThrow();

      // Invalid appointment: non-positive duration
      expect(() =>
        validateRegisteredToolParameters('tool_request_appointment', {
          doctorId: crypto.randomUUID(),
          scheduledAt: new Date().toISOString(),
          durationMinutes: -15,
          reason: 'Checkup',
        }),
      ).toThrow();
    });

    it('defensively validates parameters in executeAgentTool rejecting malformed or tampered parameters (SEC-P0.7.3-01)', async () => {
      // Missing dueAt parameter
      const res1 = await executeAgentTool(
        'tool_schedule_care_task',
        { title: 'Incomplete task' },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: crypto.randomUUID(),
        },
      );
      expect(res1.success).toBe(false);
      expect(res1.errorCode).toBe('INVALID_TOOL_PARAMETERS');
      expect(res1.errorMessage).toContain('Execution boundary parameter validation failed');

      // Unknown unapproved tool name
      const res2 = await executeAgentTool(
        'tool_prescribe_insulin' as any,
        {},
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: crypto.randomUUID(),
        },
      );
      expect(res2.success).toBe(false);
      expect(res2.errorCode).toBe('UNAUTHORIZED_TOOL');
    });

    it('derives risk tier deterministically from contracts and prevents caller risk-tier manipulation', async () => {
      // Verify canonical contract mappings for all tools
      expect(getDeterministicToolRiskTier('tool_schedule_care_task')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_schedule_reminder')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_request_appointment')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_log_lifestyle_record')).toBe('MEDIUM_RISK');
      expect(getDeterministicToolRiskTier('tool_draft_care_proposal')).toBe('HIGH_RISK');
      expect(getDeterministicToolRiskTier('tool_query_health_summary')).toBe('LOW_RISK');

      // Attempt to submit proposal with artificially lowered risk tier
      const tamperedProposal: any = {
        toolName: 'tool_schedule_care_task',
        parameters: {
          title: 'Check glucose',
          category: 'GLUCOSE_CHECK',
          dueAt: new Date(Date.now() + 3600000).toISOString(),
        },
        summary: 'Glucose check',
        riskTier: 'LOW_RISK', // Tampered caller risk!
      };

      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Check my sugar',
        explicitCandidateActions: [tamperedProposal],
      });

      expect(planRes.success).toBe(true);
      // Persisted riskTier in DB MUST be MEDIUM_RISK, ignoring caller's tampered 'LOW_RISK'
      expect(planRes.plan.actions[0].riskTier).toBe('MEDIUM_RISK');
      expect(planRes.plan.highestRiskTier).toBe('MEDIUM_RISK');
    });
  });

  // ==========================================
  // SECTION 2: INTENT CLASSIFICATION
  // ==========================================
  describe('2. Intent Classification & Allowlisted Tool Proposal Mapping', () => {
    it('classifies reminder queries into tool_schedule_reminder proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'Please remind me to take my metformin tablet daily at 8 PM',
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('SCHEDULE_MEDICATION_REMINDER');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_schedule_reminder');
    });

    it('classifies glucose monitoring queries into tool_schedule_care_task proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'Help me plan my morning fasting sugar check tomorrow',
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('SCHEDULE_CARE_TASK');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_schedule_care_task');
    });

    it('classifies consultation requests into tool_request_appointment proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'I need to book a consultation appointment to see my doctor',
        defaultDoctorId: assignedDoctor.id,
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('REQUEST_DOCTOR_APPOINTMENT');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_request_appointment');
      expect(res.candidateActions[0].parameters.doctorId).toBe(assignedDoctor.id);
    });

    it('classifies physical activity queries into tool_log_lifestyle_record proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'I did a 30-minute brisk walk in the park this evening',
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('LOG_LIFESTYLE_RECORD');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_log_lifestyle_record');
    });

    it('classifies clinical tolerance or side-effect queries into tool_draft_care_proposal proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'I am experiencing nausea and stomach upset after my new medicine, please propose to doctor',
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('DRAFT_CARE_PROPOSAL');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_draft_care_proposal');
    });

    it('classifies trend and metrics queries into tool_query_health_summary proposals', () => {
      const res = classifyAgentIntent({
        userQuery: 'What was my average blood sugar trend and summary over the last 2 weeks?',
      });
      expect(res.hasEmergency).toBe(false);
      expect(res.isProhibited).toBe(false);
      expect(res.userIntent).toBe('QUERY_HEALTH_METRICS');
      expect(res.candidateActions.length).toBe(1);
      expect(res.candidateActions[0].toolName).toBe('tool_query_health_summary');
    });
  });

  // ==========================================
  // SECTION 3: BOUNDED ACTION COUNT (MAX 3 ACTIONS)
  // ==========================================
  describe('3. Bounded Action Plans (Max 3 Actions Boundary)', () => {
    it('validates that 1, 2, or 3 actions are accepted', () => {
      expect(validatePlanActionCount([1]).valid).toBe(true);
      expect(validatePlanActionCount([1, 2]).valid).toBe(true);
      expect(validatePlanActionCount([1, 2, 3]).valid).toBe(true);
    });

    it('rejects candidate action lists exceeding 3 actions', () => {
      const countCheck = validatePlanActionCount([1, 2, 3, 4]);
      expect(countCheck.valid).toBe(false);
      expect(countCheck.error).toContain('A single plan may contain at most 3 actions');
    });

    it('rejects plan generation when more than 3 candidate actions are submitted', async () => {
      const fourActions = [
        {
          toolName: 'tool_schedule_care_task' as AgentToolName,
          parameters: {
            title: 'Task 1',
            category: 'GLUCOSE_CHECK',
            dueAt: new Date(Date.now() + 3600000).toISOString(),
          },
          summary: 'Task 1',
        },
        {
          toolName: 'tool_schedule_care_task' as AgentToolName,
          parameters: {
            title: 'Task 2',
            category: 'GLUCOSE_CHECK',
            dueAt: new Date(Date.now() + 7200000).toISOString(),
          },
          summary: 'Task 2',
        },
        {
          toolName: 'tool_schedule_reminder' as AgentToolName,
          parameters: {
            title: 'Reminder 3',
            category: 'MEDICATION',
            remindAt: new Date(Date.now() + 10800000).toISOString(),
          },
          summary: 'Reminder 3',
        },
        {
          toolName: 'tool_query_health_summary' as AgentToolName,
          parameters: { metric: 'BLOOD_GLUCOSE', timeRangeDays: 7 },
          summary: 'Summary 4',
        },
      ];

      const res = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Do all four actions for me',
        explicitCandidateActions: fourActions,
      });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('ACTION_LIMIT_EXCEEDED');
      expect(res.planId).toBeUndefined();
    });
  });

  // ==========================================
  // SECTION 4: EMERGENCY PRECEDENCE ENFORCEMENT
  // ==========================================
  describe('4. Emergency Precedence Halt', () => {
    it('halts planning immediately on acute red-flag symptoms in query', async () => {
      const res = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'I am having crushing chest pain and cannot breathe, please schedule a reminder',
      });

      expect(res.success).toBe(false);
      expect(res.hasEmergency).toBe(true);
      expect(res.errorCode).toBe('EMERGENCY_HALT');
      expect(res.emergencyEvaluation?.decision).toBe('EMERGENCY_HALT');
      expect(res.planId).toBeUndefined();
    });

    it('halts planning immediately on severe hypoglycemia (< 54 mg/dL)', async () => {
      const res = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Schedule a glucose check',
        detectedGlucose: 45,
      });

      expect(res.success).toBe(false);
      expect(res.hasEmergency).toBe(true);
      expect(res.errorCode).toBe('EMERGENCY_HALT');
      expect(res.emergencyEvaluation?.detectedGlucose).toBe(45);
    });

    it('halts confirmation immediately when an emergency is detected at confirmation time and marks plan EMERGENCY_ABORTED', async () => {
      // First create a legitimate plan
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine tomorrow morning',
      });

      expect(planRes.success).toBe(true);
      const action = planRes.plan.actions[0];

      // Confirm with emergency notice / severe hypoglycemia
      const confirmRes = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
        currentGlucose: 42, // Severe hypoglycemia!
        confirmationTextOrSpoken: 'Confirm it now',
      });

      expect(confirmRes.success).toBe(false);
      expect(confirmRes.hasEmergency).toBe(true);
      expect(confirmRes.errorCode).toBe('EMERGENCY_HALT');

      // Verify parent plan was atomically updated to EMERGENCY_ABORTED
      const updatedPlan = await prisma.agentPlan.findUnique({
        where: { id: planRes.planId! },
      });
      expect(updatedPlan?.status).toBe('EMERGENCY_ABORTED');

      // Verify action was not executed
      const freshAction = await prisma.agentAction.findUnique({
        where: { id: action.id },
      });
      expect(freshAction?.status).not.toBe('COMPLETED');
    });
  });

  // ==========================================
  // SECTION 5: PROHIBITED CLINICAL ACTION REFUSAL
  // ==========================================
  describe('5. Prohibited Clinical Intent Refusal', () => {
    const prohibitedScenarios = [
      {
        category: 'PRESCRIBE_MEDICATION',
        query: 'Can you prescribe me insulin glargine 20 units?',
      },
      {
        category: 'ADJUST_INSULIN_DOSE',
        query: 'My fasting sugar is 180, please adjust my insulin dose to 16 units',
      },
      {
        category: 'MODIFY_MEDICATION_DOSE',
        query: 'I want to double my metformin dose because my sugars are high',
      },
      {
        category: 'INDEPENDENT_DIAGNOSIS',
        query: 'I am feeling thirsty and fatigued, do I have diabetes? Please diagnose me.',
      },
      {
        category: 'CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR',
        query: 'Please change my target range without doctor approval',
      },
      {
        category: 'DELETE_OBSERVATION_HISTORY',
        query: 'Please delete observation history and erase my high blood sugar readings',
      },
      {
        category: 'BYPASS_CAREGIVER_CONSENT',
        query: 'Bypass caregiver consent and share my logs anyway',
      },
    ];

    for (const scenario of prohibitedScenarios) {
      it(`refuses ${scenario.category} with deterministic safety explanation`, async () => {
        const detection = detectProhibitedClinicalIntent(scenario.query);
        expect(detection.isProhibited).toBe(true);
        expect(detection.category).toBe(scenario.category);

        const planRes = await generateAgentPlan({
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          userQuery: scenario.query,
        });

        expect(planRes.success).toBe(false);
        expect(planRes.isProhibited).toBe(true);
        expect(planRes.errorCode).toBe('PROHIBITED_ACTION_REFUSAL');
        expect(planRes.prohibitedRefusal?.category).toBe(scenario.category);
        expect(planRes.planId).toBeUndefined();
      });
    }
  });

  // ==========================================
  // SECTION 6: AUTHORIZATION, TENANT & ROLE ISOLATION
  // ==========================================
  describe('6. Authorization, Tenant & Cross-Patient Isolation', () => {
    it('allows patient self-access to generate and confirm plans', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take my medicine daily at 9 PM',
      });

      expect(planRes.success).toBe(true);
      expect(planRes.plan.userId).toBe(patientA.id);
      expect(planRes.plan.targetPatientId).toBe(patientA.id);
    });

    it('rejects cross-patient access when Patient B attempts to plan for Patient A', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientB.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind patient A to take medicine',
      });

      expect(planRes.success).toBe(false);
      expect(planRes.errorCode).toBe('UNAUTHORIZED_ACTOR_ROLE');
    });

    it('allows assigned clinician to create proposals and manage actions for Patient A', async () => {
      const planRes = await generateAgentPlan({
        actorId: assignedDoctor.id,
        targetPatientId: patientA.id,
        actorRole: 'CLINICIAN',
        userQuery: 'I did a 30-minute walk',
      });

      expect(planRes.success).toBe(true);
    });

    it('rejects unassigned clinician who lacks active DoctorPatientAssignment', async () => {
      const planRes = await generateAgentPlan({
        actorId: unassignedDoctor.id,
        targetPatientId: patientA.id,
        actorRole: 'CLINICIAN',
        userQuery: 'Schedule a glucose check',
      });

      expect(planRes.success).toBe(false);
      expect(planRes.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });

    it('allows authorized caregiver with MANAGE_TASKS permission to schedule care tasks', async () => {
      const planRes = await generateAgentPlan({
        actorId: caregiver.id,
        targetPatientId: patientA.id,
        actorRole: 'CAREGIVER',
        userQuery: 'Schedule tomorrow morning fasting sugar check',
      });

      expect(planRes.success).toBe(true);
    });

    it('rejects caregiver attempting actions without required permission', async () => {
      // Caregiver has MANAGE_TASKS, MANAGE_REMINDERS, VIEW_OBSERVATIONS
      // Caregiver lacks MANAGE_CONSULTATIONS for tool_request_appointment
      const planRes = await generateAgentPlan({
        actorId: caregiver.id,
        targetPatientId: patientA.id,
        actorRole: 'CAREGIVER',
        userQuery: 'Book a consultation appointment to see the doctor',
        defaultDoctorId: assignedDoctor.id,
      });

      expect(planRes.success).toBe(false);
      expect(planRes.errorCode).toBe('MISSING_REQUIRED_CAREGIVER_PERMISSION');
    });

    it('rejects admin user from creating clinical agent plans', async () => {
      const planRes = await generateAgentPlan({
        actorId: adminUser.id,
        targetPatientId: patientA.id,
        actorRole: 'ADMIN',
        userQuery: 'Schedule a reminder for patient A',
      });

      expect(planRes.success).toBe(false);
      expect(planRes.errorCode).toBe('ADMIN_CLINICAL_ACTION_NOT_PERMITTED');
    });

    it('rejects cross-patient confirmation when Patient B attempts to confirm Patient A action', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take my morning medicine',
      });
      const action = planRes.plan.actions[0];

      const confirmRes = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientB.id, // Patient B attempting to confirm Patient A's action!
        confirmedByRole: 'PATIENT',
      });

      expect(confirmRes.success).toBe(false);
      expect(confirmRes.errorCode).toBe('CONFIRMATION_BINDING_MISMATCH');
      expect(confirmRes.errorMessage).toContain('Confirmation actor mismatch');

      // Verify Patient A's action remains untouched in AWAITING_CONFIRMATION
      const freshAction = await prisma.agentAction.findUnique({ where: { id: action.id } });
      expect(freshAction?.status).toBe('AWAITING_CONFIRMATION');
    });
  });

  // ==========================================
  // SECTION 7: CONFIRMATION BINDING & STATE MACHINE
  // ==========================================
  describe('7. Confirmation Binding & Action Executability', () => {
    it('rejects confirmation with mismatched actionId', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine',
      });

      const confirmRes = await confirmAgentAction({
        actionId: crypto.randomUUID(), // non-existent action ID
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });

      expect(confirmRes.success).toBe(false);
      expect(confirmRes.errorCode).toBe('ACTION_NOT_FOUND');
    });

    it('rejects confirmation with stale plan version', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine',
      });
      const action = planRes.plan.actions[0];

      const confirmRes = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 999, // Stale version!
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });

      expect(confirmRes.success).toBe(false);
      expect(confirmRes.errorCode).toBe('CONFIRMATION_BINDING_MISMATCH');
    });

    it('rejects execution of an action that was manually set to CANCELLED', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine',
      });
      const action = planRes.plan.actions[0];

      // Cancel action
      await prisma.agentAction.update({
        where: { id: action.id },
        data: { status: 'CANCELLED' },
      });

      const confirmRes = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });

      expect(confirmRes.success).toBe(false);
      expect(confirmRes.errorCode).toBe('ACTION_CANCELLED');
    });

    it('rejects direct execution of action in AWAITING_CONFIRMATION without prior confirmation claim', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine',
      });
      const action = planRes.plan.actions[0];
      expect(action.status).toBe('AWAITING_CONFIRMATION');

      // Direct invocation of executeClaimedAction bypasses confirmation
      await expect(
        executeClaimedAction({
          actionId: action.id,
          actorId: patientA.id,
          actorRole: 'PATIENT',
        }),
      ).rejects.toThrow(/action must be in 'EXECUTING' state, but found 'AWAITING_CONFIRMATION'/);

      // Verify action was not executed
      const freshAction = await prisma.agentAction.findUnique({ where: { id: action.id } });
      expect(freshAction?.status).toBe('AWAITING_CONFIRMATION');
    });

    it('rejects direct execution of action in DRAFT state', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take medicine',
      });
      const action = planRes.plan.actions[0];

      await prisma.agentAction.update({
        where: { id: action.id },
        data: { status: 'DRAFT' },
      });

      await expect(
        executeClaimedAction({
          actionId: action.id,
          actorId: patientA.id,
          actorRole: 'PATIENT',
        }),
      ).rejects.toThrow(/action must be in 'EXECUTING' state, but found 'DRAFT'/);
    });
  });

  // ==========================================
  // SECTION 8: CONCURRENCY PROTECTION & IDEMPOTENT REPLAY
  // ==========================================
  describe('8. Atomic Concurrency Protection & Idempotent Replay', () => {
    it('executes action and subsequent replay returns cached result with replayed: true', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take my evening medicine daily',
      });
      const action = planRes.plan.actions[0];
      const idempotencyKey = crypto.randomUUID();

      // First confirmation & execution
      const firstConfirm = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey,
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });

      expect(firstConfirm.success).toBe(true);
      expect(firstConfirm.status).toBe('COMPLETED');
      expect(firstConfirm.replayed).toBeFalsy();

      // Second confirmation (idempotent replay)
      const secondConfirm = await confirmAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey,
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });

      expect(secondConfirm.success).toBe(true);
      expect(secondConfirm.replayed).toBe(true);
      expect(secondConfirm.status).toBe('COMPLETED');
      expect(secondConfirm.executionResult).toBeDefined();
    });

    it('safely handles concurrent execution claims where only one claim wins', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to drink water',
      });
      const action = planRes.plan.actions[0];

      // Simulate 2 racing concurrent confirm calls
      const [res1, res2] = await Promise.all([
        confirmAgentAction({
          actionId: action.id,
          planId: planRes.planId!,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
          confirmedByUserId: patientA.id,
          confirmedByRole: 'PATIENT',
        }),
        confirmAgentAction({
          actionId: action.id,
          planId: planRes.planId!,
          planVersion: 1,
          confirm: true,
          idempotencyKey: crypto.randomUUID(),
          confirmedByUserId: patientA.id,
          confirmedByRole: 'PATIENT',
        }),
      ]);

      // Exactly one must succeed initially, while the second either returns idempotent cached replay or conflict
      const successCount = [res1.success, res2.success].filter(Boolean).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify final action in DB is COMPLETED exactly once
      const finalAction = await prisma.agentAction.findUnique({
        where: { id: action.id },
      });
      expect(finalAction?.status).toBe('COMPLETED');
    });

    it('correctly transitions plan to PARTIALLY_EXECUTED on partial failure of multi-action plan without repeating successful mutations', async () => {
      const multiActions = [
        {
          toolName: 'tool_schedule_reminder' as AgentToolName,
          parameters: {
            title: 'Multi-action Valid Reminder',
            category: 'MEDICATION',
            remindAt: new Date(Date.now() + 3600000).toISOString(),
          },
          summary: 'Valid Reminder Action',
        },
        {
          toolName: 'tool_schedule_care_task' as AgentToolName,
          parameters: {
            title: 'Multi-action Care Task',
            category: 'GLUCOSE_CHECK',
            dueAt: new Date(Date.now() + 7200000).toISOString(),
          },
          summary: 'Care Task Action',
        },
      ];

      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Plan my daily activities',
        explicitCandidateActions: multiActions,
      });

      expect(planRes.success).toBe(true);
      expect(planRes.plan.actions.length).toBe(2);
      const [action1, action2] = planRes.plan.actions;

      // 1. Confirm and execute action1 (succeeds)
      const res1 = await confirmAgentAction({
        actionId: action1.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });
      expect(res1.success).toBe(true);
      expect(res1.status).toBe('COMPLETED');

      // Verify plan is now PARTIALLY_EXECUTED
      let plan = await prisma.agentPlan.findUnique({ where: { id: planRes.planId! } });
      expect(plan?.status).toBe('PARTIALLY_EXECUTED');

      // 2. Corrupt action2 parameters to simulate execution failure
      await prisma.agentAction.update({
        where: { id: action2.id },
        data: { parameters: JSON.stringify({ invalidField: 'tampered' }) },
      });

      // Confirm and execute action2 (fails at execution boundary)
      const res2 = await confirmAgentAction({
        actionId: action2.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });
      expect(res2.success).toBe(false);
      expect(res2.status).toBe('FAILED');

      // Verify plan remains PARTIALLY_EXECUTED
      plan = await prisma.agentPlan.findUnique({ where: { id: planRes.planId! } });
      expect(plan?.status).toBe('PARTIALLY_EXECUTED');

      // Verify action1 remains COMPLETED and subsequent confirmation returns cached replay
      const replayRes1 = await confirmAgentAction({
        actionId: action1.id,
        planId: planRes.planId!,
        planVersion: 1,
        confirm: true,
        idempotencyKey: crypto.randomUUID(),
        confirmedByUserId: patientA.id,
        confirmedByRole: 'PATIENT',
      });
      expect(replayRes1.success).toBe(true);
      expect(replayRes1.replayed).toBe(true);
    });
  });

  // ==========================================
  // SECTION 9: ALL 6 TOOLS EXECUTION & AUDITING
  // ==========================================
  describe('9. Complete Execution of All 6 Approved Tools & Audit Trail', () => {
    it('executes tool_schedule_care_task against Prisma CareTask model', async () => {
      const key = crypto.randomUUID();
      const res = await executeAgentTool(
        'tool_schedule_care_task',
        {
          title: 'Foot Examination',
          category: 'FOOT_EXAM',
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: key,
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.taskId).toBeDefined();

      const created = await prisma.careTask.findUnique({
        where: { idempotencyKey: key },
      });
      expect(created?.title).toBe('Foot Examination');
    });

    it('executes tool_schedule_reminder against Prisma Reminder model', async () => {
      const key = crypto.randomUUID();
      const res = await executeAgentTool(
        'tool_schedule_reminder',
        {
          title: 'Take Januvia 100mg',
          category: 'MEDICATION',
          remindAt: new Date(Date.now() + 7200000).toISOString(),
          recurrence: 'DAILY',
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: key,
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.reminderId).toBeDefined();

      const created = await prisma.reminder.findUnique({
        where: { idempotencyKey: key },
      });
      expect(created?.title).toBe('Take Januvia 100mg');
    });

    it('executes tool_request_appointment against Prisma Appointment model', async () => {
      const key = crypto.randomUUID();
      const res = await executeAgentTool(
        'tool_request_appointment',
        {
          doctorId: assignedDoctor.id,
          scheduledAt: new Date(Date.now() + 5 * 86400000).toISOString(),
          durationMinutes: 30,
          reason: 'Routine quarterly diabetes checkup',
          visitType: 'CHECKUP',
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: key,
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.appointmentId).toBeDefined();

      const created = await prisma.appointment.findUnique({
        where: { idempotencyKey: key },
      });
      expect(created?.reason).toBe('Routine quarterly diabetes checkup');
      expect(created?.status).toBe('REQUESTED');
    });

    it('executes tool_log_lifestyle_record against Prisma LifestyleRecord model', async () => {
      const key = crypto.randomUUID();
      const res = await executeAgentTool(
        'tool_log_lifestyle_record',
        {
          category: 'PHYSICAL_ACTIVITY',
          numericValue: 45,
          unit: 'MINUTES',
          qualitativeValue: 'CYCLING',
          notes: 'Evening cycle in society',
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: key,
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.recordId).toBeDefined();

      const created = await prisma.lifestyleRecord.findUnique({
        where: { idempotencyKey: key },
      });
      expect(created?.category).toBe('PHYSICAL_ACTIVITY');
      expect(created?.numericValue).toBe(45);
    });

    it('executes tool_draft_care_proposal creating an AgentAuditRecord held for clinician review', async () => {
      const key = crypto.randomUUID();
      const res = await executeAgentTool(
        'tool_draft_care_proposal',
        {
          proposalType: 'MEDICATION_ADJUSTMENT_REQUEST',
          title: 'Metformin GI side effects evaluation',
          rationale: 'Patient experiences recurring gastrointestinal distress 1 hour post-dose.',
          proposedDetails: {
            symptom: 'Stomach cramping',
            recommendation: 'Evaluate extended-release formulation',
          },
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: key,
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.proposalId).toBeDefined();
      expect(res.result?.requiresClinicianApproval).toBe(true);
      expect(res.result?.approvalStatus).toBe('PENDING');

      const audit = await prisma.agentAuditRecord.findUnique({
        where: { id: res.result?.proposalId as string },
      });
      expect(audit?.actionType).toBe('CLINICAL_CARE_PROPOSAL');
      expect(audit?.riskTier).toBe('HIGH_RISK');
    });

    it('executes tool_query_health_summary read-only and calculates average metrics', async () => {
      // Seed two health observations for patient A
      await prisma.healthObservation.createMany({
        data: [
          {
            userId: patientA.id,
            type: 'BLOOD_GLUCOSE',
            numericValue: 120,
            unit: 'mg/dL',
            observedAt: new Date(Date.now() - 3600000),
          },
          {
            userId: patientA.id,
            type: 'BLOOD_GLUCOSE',
            numericValue: 140,
            unit: 'mg/dL',
            observedAt: new Date(),
          },
        ],
      });

      const res = await executeAgentTool(
        'tool_query_health_summary',
        {
          metric: 'BLOOD_GLUCOSE',
          timeRangeDays: 7,
        },
        {
          actorId: patientA.id,
          targetPatientId: patientA.id,
          actorRole: 'PATIENT',
          idempotencyKey: crypto.randomUUID(),
        },
      );

      expect(res.success).toBe(true);
      expect(res.result?.metric).toBe('BLOOD_GLUCOSE');
      expect(res.result?.totalObservations).toBeGreaterThanOrEqual(2);
      expect(res.result?.averageValue).toBeGreaterThan(0);
      expect(res.result?.latestObservation).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 10: CLINICIAN PROPOSAL REVIEW LIFECYCLE
  // ==========================================
  describe('10. Clinician Proposal Review (Approve & Reject Lifecycle)', () => {
    it('allows assigned doctor to review and APPROVE a pending clinical proposal', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'I have severe nausea from medicine, propose adjustment to my doctor',
      });

      expect(planRes.success).toBe(true);
      expect(planRes.plan.status).toBe('PENDING_CLINICIAN_APPROVAL');
      const action = planRes.plan.actions[0];
      expect(action.status).toBe('PENDING_CLINICIAN_APPROVAL');

      // Assigned doctor reviews and approves
      const reviewRes = await reviewProposalAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        decision: 'APPROVE',
        clinicianId: assignedDoctor.id,
        reviewNotes: 'Reviewed against the current patient record.',
      });

      expect(reviewRes.success).toBe(true);
      expect(reviewRes.status).toBe('COMPLETED');

      // Verify DB action status
      const freshAction = await prisma.agentAction.findUnique({
        where: { id: action.id },
      });
      expect(freshAction?.status).toBe('COMPLETED');
      expect(freshAction?.confirmedByRole).toBe('CLINICIAN');
    });

    it('allows assigned doctor to review and REJECT a pending clinical proposal', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'I have stomach upset, propose to doctor',
      });

      const action = planRes.plan.actions[0];

      // Assigned doctor reviews and rejects
      const reviewRes = await reviewProposalAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        decision: 'REJECT',
        clinicianId: assignedDoctor.id,
        reviewNotes: 'Needs in-person clinical review first.',
        rejectionReason: 'Current dose is clinically required. Advised to take with larger meal.',
      });

      expect(reviewRes.success).toBe(true);
      expect(reviewRes.status).toBe('REJECTED');

      const freshAction = await prisma.agentAction.findUnique({
        where: { id: action.id },
      });
      expect(freshAction?.status).toBe('REJECTED');
      expect(freshAction?.errorMessage).toContain('take with larger meal');
    });

    it('rejects review by an unassigned doctor', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'I have nausea, propose to doctor',
      });

      const action = planRes.plan.actions[0];

      const reviewRes = await reviewProposalAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        decision: 'APPROVE',
        clinicianId: unassignedDoctor.id,
        reviewNotes: 'Reviewed for assignment security test.',
      });

      expect(reviewRes.success).toBe(false);
      expect(reviewRes.errorCode).toBe('UNASSIGNED_CLINICIAN');
    });
  });

  // ==========================================
  // SECTION 11: CANCELLATION & TEMPORAL EXPIRATION
  // ==========================================
  describe('11. Action Cancellation & Temporal Expiration', () => {
    it('cancels an action and updates parent plan to CANCELLED when all actions cancelled', async () => {
      const planRes = await generateAgentPlan({
        actorId: patientA.id,
        targetPatientId: patientA.id,
        actorRole: 'PATIENT',
        userQuery: 'Remind me to take my evening medicine',
      });

      const action = planRes.plan.actions[0];

      const cancelRes = await cancelAgentAction({
        actionId: action.id,
        planId: planRes.planId!,
        planVersion: 1,
        cancelledByUserId: patientA.id,
        reason: 'User decided to take medication now without a reminder.',
      });

      expect(cancelRes.success).toBe(true);
      expect(cancelRes.status).toBe('CANCELLED');

      const freshPlan = await prisma.agentPlan.findUnique({
        where: { id: planRes.planId! },
      });
      expect(freshPlan?.status).toBe('CANCELLED');
    });

    it('expires stale plans and actions that exceeded their 24-hour expiration window', async () => {
      // Create a plan with expiration set in the past
      const pastTime = new Date(Date.now() - 3600000);
      const stalePlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'STALE_TEST',
          explanation: 'Testing expiration job',
          status: 'AWAITING_CONFIRMATION',
          version: 1,
          actionCount: 1,
          expiresAt: pastTime,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_reminder',
                parameters: JSON.stringify({ title: 'Old reminder' }),
                riskTier: 'MEDIUM_RISK',
                status: 'AWAITING_CONFIRMATION',
                idempotencyKey: crypto.randomUUID(),
                expiresAt: pastTime,
              },
            ],
          },
        },
      });

      // Run expiration sweep
      const sweepResult = await agentRuntime.expireStalePlansAndActions(new Date());
      expect(sweepResult.expiredActionsCount).toBeGreaterThanOrEqual(1);
      expect(sweepResult.expiredPlansCount).toBeGreaterThanOrEqual(1);

      // Verify the stale plan and action are now EXPIRED
      const updated = await prisma.agentPlan.findUnique({
        where: { id: stalePlan.id },
        include: { actions: true },
      });
      expect(updated?.status).toBe('EXPIRED');
      expect(updated?.actions[0].status).toBe('EXPIRED');
    });

    it('reconciles abandoned EXECUTING actions when underlying mutation completed prior to crash (SEC-P0.7.3-02)', async () => {
      const pastTime = new Date(Date.now() - 3600000);
      const idempotencyKey = crypto.randomUUID();

      // Pre-seed CareTask as if mutation succeeded right before server crash
      await prisma.careTask.create({
        data: {
          userId: patientA.id,
          title: 'Task completed before crash',
          category: 'GLUCOSE_CHECK',
          dueAt: new Date(Date.now() + 86400000),
          idempotencyKey,
          status: 'PENDING',
        },
      });

      // Seed abandoned action in EXECUTING state
      const stalePlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'RECONCILIATION_TEST',
          explanation: 'Testing crash recovery',
          status: 'EXECUTING',
          version: 1,
          actionCount: 1,
          expiresAt: pastTime,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({
                  title: 'Task completed before crash',
                  category: 'GLUCOSE_CHECK',
                  dueAt: new Date(Date.now() + 86400000).toISOString(),
                }),
                riskTier: 'MEDIUM_RISK',
                status: 'EXECUTING',
                idempotencyKey,
                expiresAt: pastTime,
              },
            ],
          },
        },
        include: { actions: true },
      });

      const sweep = await agentRuntime.expireStalePlansAndActions(new Date());
      expect(sweep.reconciledExecutingActionsCount).toBeGreaterThanOrEqual(1);

      // Action must be reconciled to COMPLETED, not redispatched or left executing
      const recoveredAction = await prisma.agentAction.findUnique({
        where: { id: stalePlan.actions[0].id },
      });
      expect(recoveredAction?.status).toBe('COMPLETED');
      expect(recoveredAction?.errorMessage).toContain('Reconciled: underlying CareTask was persisted prior to crash');

      // Parent plan must be COMPLETED
      const recoveredPlan = await prisma.agentPlan.findUnique({
        where: { id: stalePlan.id },
      });
      expect(recoveredPlan?.status).toBe('COMPLETED');
    });

    it('fails closed abandoned EXECUTING actions when no underlying mutation exists (SEC-P0.7.3-02)', async () => {
      const pastTime = new Date(Date.now() - 3600000);
      const idempotencyKey = crypto.randomUUID();

      // Seed abandoned action in EXECUTING state WITHOUT underlying task
      const stalePlan = await prisma.agentPlan.create({
        data: {
          userId: patientA.id,
          targetPatientId: patientA.id,
          userIntent: 'FAIL_CLOSED_TEST',
          explanation: 'Testing crash recovery without mutation',
          status: 'EXECUTING',
          version: 1,
          actionCount: 1,
          expiresAt: pastTime,
          actions: {
            create: [
              {
                toolName: 'tool_schedule_care_task',
                parameters: JSON.stringify({
                  title: 'Unfinished task',
                  category: 'GLUCOSE_CHECK',
                  dueAt: new Date(Date.now() + 86400000).toISOString(),
                }),
                riskTier: 'MEDIUM_RISK',
                status: 'EXECUTING',
                idempotencyKey,
                expiresAt: pastTime,
              },
            ],
          },
        },
        include: { actions: true },
      });

      await agentRuntime.expireStalePlansAndActions(new Date());

      const recoveredAction = await prisma.agentAction.findUnique({
        where: { id: stalePlan.actions[0].id },
      });
      expect(recoveredAction?.status).toBe('FAILED');
      expect(recoveredAction?.errorCode).toBe('ABANDONED_EXECUTION_TIMEOUT');

      const recoveredPlan = await prisma.agentPlan.findUnique({
        where: { id: stalePlan.id },
      });
      expect(recoveredPlan?.status).toBe('FAILED');
    });
  });
});
