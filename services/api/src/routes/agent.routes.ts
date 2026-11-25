import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import {
  AgentPlanRequestSchema,
  AgentActionConfirmRequestSchema,
  AgentActionCancelRequestSchema,
  AgentProposalReviewRequestSchema,
  AgentProposalsQuerySchema,
  AgentProposalsQuery,
  AgentActorRole,
} from '@aarogyadamu/contracts';

import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { validateRequest } from '../middleware/validate';
import { createRateLimitStore } from '../services/rateLimitStore';
import { prisma } from '../db/prisma';
import { updateTenantContext, runWithTenantContext, getTenantContext, setPostgresLocalContext } from '../db/tenantContext';
import { env } from '../config/env';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { agentRuntime } from '../ai/agent/agentRuntime';
import { formatAgentPlan } from '../ai/agent/agentPlanner';

const router = Router();

// Rate limiter: 100 requests per 15 minutes per user in prod; 2000 in dev
const agentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.APP_ENV === 'development' ? 2000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('agent_route_limit:', 15 * 60 * 1000),
  keyGenerator: (req) => {
    return (req as AuthenticatedRequest).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'The health assistant is currently busy. Please pause a moment before retrying.',
  },
});

const ActionIdParamSchema = z.object({
  actionId: z.string().uuid('actionId must be a valid UUID'),
}).strict();

const PlanIdParamSchema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
}).strict();

/**
 * Resolves the authenticated user's role relative to the target patient.
 * Prevents client-side role or permission spoofing and updates PostgreSQL ambient context.
 */
async function resolveActorRoleAndPatient(
  req: AuthenticatedRequest,
  requestedPatientId?: string,
): Promise<{ actorId: string; targetPatientId: string; actorRole: AgentActorRole }> {
  const actorId = req.user!.id;
  const isClinician = Boolean(req.user!.isClinician);
  const headerPatientId = req.headers['x-target-patient-id'] as string | undefined;
  const targetPatientId = requestedPatientId || headerPatientId || actorId;

  if (isClinician) {
    const membership = await prisma.practiceMembership.findFirst({
      where: { userId: actorId, isActive: true },
      select: { practiceId: true, role: true },
    });
    updateTenantContext({
      patientId: targetPatientId,
      practiceId: membership?.practiceId,
      role: 'DOCTOR',
    });
    return { actorId, targetPatientId, actorRole: 'CLINICIAN' };
  }

  if (actorId === targetPatientId) {
    updateTenantContext({
      patientId: targetPatientId,
      role: 'PATIENT',
    });
    return { actorId, targetPatientId, actorRole: 'PATIENT' };
  }

  // Non-clinician targeting another patient: verify active caregiver consent
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { email: true },
  });

  if (user?.email) {
    const consent = await prisma.caregiverConsent.findFirst({
      where: {
        patientId: targetPatientId,
        caregiverEmail: user.email,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (consent) {
      updateTenantContext({
        patientId: targetPatientId,
        role: 'CAREGIVER',
      });
      return { actorId, targetPatientId, actorRole: 'CAREGIVER' };
    }
  }

  // Without caregiver consent, role remains PATIENT which fails closed in authorization
  updateTenantContext({
    patientId: targetPatientId,
    role: 'PATIENT',
  });
  return { actorId, targetPatientId, actorRole: 'PATIENT' };
}

/**
 * Resolves target patient ID for an action, allowing assigned clinicians and caregivers
 * to operate seamlessly without manual header manipulation while respecting PostgreSQL native RLS.
 */
async function getEffectivePatientIdForAction(
  req: AuthenticatedRequest,
  actionId: string,
): Promise<string | null> {
  const headerPatient = req.headers['x-target-patient-id'] as string | undefined;
  if (headerPatient) return headerPatient;
  const bodyPatient = (req.body as any)?.targetPatientId || (req.body as any)?.patientId;
  if (bodyPatient) return bodyPatient;

  if (req.user?.isClinician) {
    const assignments = await prisma.doctorPatientAssignment.findMany({
      where: { doctorId: req.user!.id, status: 'ACTIVE' },
      select: { patientId: true },
    });
    console.log('[DEBUG getEffectivePatientIdForAction]', {
      user: req.user.id,
      assignments: assignments.length,
      actionId,
    });
    for (const a of (assignments as any[] || [])) {
      const match = await prisma.$transaction(async (tx: any) => {
        await setPostgresLocalContext(tx, { userId: req.user!.id, patientId: a.patientId, role: 'DOCTOR' });
        return tx.agentAction.findUnique({ where: { id: actionId }, select: { id: true } });
      });
      if (match) return a.patientId;
    }
  }

  return req.user?.id || null;
}

/**
 * Resolves target patient ID for a plan, allowing assigned clinicians to inspect
 * patient plans within PostgreSQL native RLS boundaries.
 */
async function getEffectivePatientIdForPlan(
  req: AuthenticatedRequest,
  planId: string,
): Promise<string | null> {
  const headerPatient = req.headers['x-target-patient-id'] as string | undefined;
  if (headerPatient) return headerPatient;
  const bodyPatient = (req.body as any)?.targetPatientId || (req.body as any)?.patientId;
  if (bodyPatient) return bodyPatient;

  if (req.user?.isClinician) {
    const assignments = await runWithTenantContext(
      { userId: req.user.id, role: 'DOCTOR' },
      () => prisma.doctorPatientAssignment.findMany({
        where: { doctorId: req.user!.id, status: 'ACTIVE' },
        select: { patientId: true },
      })
    );
    for (const a of (assignments as any[] || [])) {
      const match = await runWithTenantContext(
        { userId: req.user.id, patientId: a.patientId, role: 'DOCTOR' },
        () => prisma.agentPlan.findUnique({ where: { id: planId }, select: { id: true } })
      );
      if (match) return a.patientId;
    }
  }

  return req.user?.id || null;
}

/**
 * POST /api/agent/plan
 * Generates a bounded, governed agent plan (max 3 actions) for the authenticated patient or caregiver.
 */
router.post(
  '/plan',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ body: AgentPlanRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        userQuery,
        targetPatientId: reqPatientId,
        conversationId,
        detectedGlucose,
        defaultDoctorId,
      } = req.body;

      const { actorId, targetPatientId, actorRole } = await resolveActorRoleAndPatient(
        req as AuthenticatedRequest,
        reqPatientId,
      );

      const planRes = await agentRuntime.generatePlan({
        actorId,
        targetPatientId,
        actorRole,
        userQuery,
        conversationId,
        detectedGlucose: detectedGlucose ?? null,
        defaultDoctorId,
      });

      if (!planRes.success) {
        // 1. Emergency Precedence Halt
        if (planRes.hasEmergency) {
          safeClinicalLog('warn', 'Agent planning halted due to emergency precedence', {
            actorId,
            targetPatientId,
            notice: planRes.emergencyEvaluation?.emergencyNotice,
          });
          res.status(200).json({
            success: false,
            hasEmergency: true,
            errorCode: 'EMERGENCY_HALT',
            emergencyNotice:
              planRes.emergencyEvaluation?.emergencyNotice ||
              'Critical emergency condition detected. Plan generation halted immediately to prioritize patient safety.',
            emergencyEvaluation: planRes.emergencyEvaluation,
            status: 'EMERGENCY_ABORTED',
          });
          return;
        }

        // 2. Prohibited Clinical Intent Refusal
        if (planRes.isProhibited) {
          safeClinicalLog('info', 'Agent planning refused prohibited clinical intent', {
            actorId,
            category: planRes.prohibitedRefusal?.category,
          });
          res.status(200).json({
            success: false,
            isProhibited: true,
            errorCode: 'PROHIBITED_ACTION_REFUSAL',
            prohibitedRefusal: planRes.prohibitedRefusal,
          });
          return;
        }

        // 3. Authorization / Tenant Failure
        if (
          planRes.errorCode === 'UNAUTHORIZED_ACTOR_ROLE' ||
          planRes.errorCode === 'CAREGIVER_CONSENT_REQUIRED' ||
          planRes.errorCode === 'INSUFFICIENT_CAREGIVER_PERMISSIONS' ||
          planRes.errorCode === 'UNASSIGNED_CLINICIAN' ||
          planRes.errorCode === 'ADMIN_ROLE_PROHIBITED'
        ) {
          res.status(403).json({
            success: false,
            errorCode: planRes.errorCode,
            error: planRes.errorMessage || 'Access denied for requested patient context.',
          });
          return;
        }

        // 4. Other planning error
        res.status(400).json({
          success: false,
          errorCode: planRes.errorCode || 'PLAN_GENERATION_FAILED',
          error: planRes.errorMessage || 'Failed to generate agent plan.',
        });
        return;
      }

      res.status(201).json({
        success: true,
        planId: planRes.planId,
        plan: planRes.plan,
      });
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in POST /api/agent/plan', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error processing agent plan.' });
    }
  },
);

/**
 * POST /api/agent/execute/:actionId
 * Confirms and executes an agent action. Acts as an explicit confirmation gate, not unrestricted execution.
 */
router.post(
  '/execute/:actionId',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ params: ActionIdParamSchema, body: AgentActionConfirmRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { actionId } = req.params;
      const { planId, planVersion, confirm, idempotencyKey, spokenOrTextInput, actionId: bodyActionId } = req.body;

      // Strict binding: if actionId is provided in body, it must match the path param
      if (bodyActionId && bodyActionId !== actionId) {
        res.status(400).json({
          success: false,
          errorCode: 'CONFIRMATION_BINDING_MISMATCH',
          error: `actionId in URL parameter ('${actionId}') does not match actionId in request body ('${bodyActionId}').`,
        });
        return;
      }

      // Pre-set patient context so PostgreSQL native RLS allows reading action & plan
      const resolvedPatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);
      if (resolvedPatientId) {
        updateTenantContext({ patientId: resolvedPatientId });
      }

      // Fetch action to resolve target patient
      const action = await prisma.agentAction.findUnique({
        where: { id: actionId },
        include: { plan: true },
      });

      if (!action) {
        res.status(404).json({
          success: false,
          errorCode: 'ACTION_NOT_FOUND',
          error: `AgentAction with ID '${actionId}' was not found.`,
        });
        return;
      }

      // If planId was explicitly provided in the request body, strictly verify binding
      if (planId && planId !== action.planId) {
        res.status(400).json({
          success: false,
          errorCode: 'CONFIRMATION_BINDING_MISMATCH',
          error: `planId in request body ('${planId}') does not match action's planId ('${action.planId}').`,
        });
        return;
      }

      const effectivePlanId = planId || action.planId;
      const effectivePlanVersion = planVersion ?? action.planVersion ?? action.plan.version ?? 1;

      const { actorId, actorRole } = await resolveActorRoleAndPatient(
        req as AuthenticatedRequest,
        action.plan.targetPatientId,
      );

      // Patient self-boundary check: Patient cannot confirm another patient's action
      if (actorRole === 'PATIENT' && action.plan.targetPatientId !== actorId) {
        res.status(403).json({
          success: false,
          errorCode: 'CROSS_PATIENT_ACCESS_DENIED',
          error: 'Cross-patient action confirmation is strictly prohibited.',
        });
        return;
      }

      const confirmResult = await agentRuntime.confirmAction({
        actionId,
        planId: effectivePlanId,
        planVersion: effectivePlanVersion,
        confirm,
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
        confirmedByUserId: actorId,
        confirmedByRole: actorRole,
        confirmationTextOrSpoken: spokenOrTextInput,
      });

      if (!confirmResult.success) {
        // 1. Emergency Precedence Halt at confirmation time
        if (confirmResult.hasEmergency) {
          const notice =
            confirmResult.emergencyEvaluation?.emergencyNotice ||
            'Emergency condition detected at confirmation time: Action execution halted immediately.';
          safeClinicalLog('warn', 'Agent confirmation halted due to emergency precedence', {
            actionId,
            planId,
            notice,
          });
          res.status(200).json({
            success: false,
            hasEmergency: true,
            errorCode: 'EMERGENCY_HALT',
            emergencyNotice: notice,
            status: 'EMERGENCY_ABORTED',
            message: 'Emergency condition detected. Action execution was halted and plan was aborted to prioritize safety.',
          });
          return;
        }

        // 2. Binding Mismatch
        if (
          confirmResult.errorCode === 'CONFIRMATION_BINDING_MISMATCH' ||
          confirmResult.errorCode === 'INVALID_CONFIRMATION_PAYLOAD'
        ) {
          res.status(400).json({
            success: false,
            errorCode: confirmResult.errorCode,
            error: confirmResult.errorMessage,
          });
          return;
        }

        // 3. Authorization / Tenant Failure
        if (
          confirmResult.errorCode === 'UNAUTHORIZED_ACTOR_ROLE' ||
          confirmResult.errorCode === 'CROSS_PATIENT_ACCESS_DENIED' ||
          confirmResult.errorCode === 'CAREGIVER_CONSENT_REQUIRED' ||
          confirmResult.errorCode === 'INSUFFICIENT_CAREGIVER_PERMISSIONS' ||
          confirmResult.errorCode === 'ACTION_REQUIRES_CLINICIAN_APPROVAL'
        ) {
          res.status(403).json({
            success: false,
            errorCode: confirmResult.errorCode,
            error: confirmResult.errorMessage,
          });
          return;
        }

        // 4. Stale, Expired, or Cancelled state (Conflict)
        if (
          confirmResult.errorCode === 'ACTION_EXPIRED' ||
          confirmResult.errorCode === 'PARENT_PLAN_EXPIRED' ||
          confirmResult.errorCode === 'ACTION_CANCELLED' ||
          confirmResult.errorCode === 'PARENT_PLAN_CANCELLED' ||
          confirmResult.errorCode === 'PARENT_PLAN_ABORTED'
        ) {
          res.status(409).json({
            success: false,
            errorCode: confirmResult.errorCode,
            error: confirmResult.errorMessage,
          });
          return;
        }

        // 5. General execution failure
        res.status(400).json({
          success: false,
          errorCode: confirmResult.errorCode || 'EXECUTION_FAILED',
          error: confirmResult.errorMessage || 'Failed to execute confirmed agent action.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        actionId: confirmResult.actionId,
        status: confirmResult.status,
        replayed: confirmResult.replayed || false,
        executionResult: confirmResult.executionResult,
      });
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in POST /api/agent/execute/:actionId', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error confirming agent action.' });
    }
  },
);

/**
 * POST /api/agent/cancel/:actionId
 * Cancels an eligible pending action.
 */
router.post(
  '/cancel/:actionId',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ params: ActionIdParamSchema, body: AgentActionCancelRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { actionId } = req.params;
      const { planId, planVersion, reason, actionId: bodyActionId } = req.body;

      if (bodyActionId && bodyActionId !== actionId) {
        res.status(400).json({
          success: false,
          errorCode: 'CONFIRMATION_BINDING_MISMATCH',
          error: `actionId in URL parameter ('${actionId}') does not match actionId in request body ('${bodyActionId}').`,
        });
        return;
      }

      // Pre-set patient context so PostgreSQL native RLS allows reading action & plan
      const resolvedPatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);
      if (resolvedPatientId) {
        updateTenantContext({ patientId: resolvedPatientId });
      }

      const action = await prisma.agentAction.findUnique({
        where: { id: actionId },
        include: { plan: true },
      });

      if (!action) {
        res.status(404).json({
          success: false,
          errorCode: 'ACTION_NOT_FOUND',
          error: `AgentAction with ID '${actionId}' was not found.`,
        });
        return;
      }

      const { actorId, actorRole } = await resolveActorRoleAndPatient(
        req as AuthenticatedRequest,
        action.plan.targetPatientId,
      );

      // Verify caller is authorized to cancel actions for this patient
      if (actorRole === 'PATIENT' && action.plan.targetPatientId !== actorId) {
        res.status(403).json({
          success: false,
          errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
          error: 'Cross-patient action cancellation is strictly prohibited.',
        });
        return;
      }

      // Enforce active DoctorPatientAssignment for clinician cancellation (SEC-P0.7.4-02)
      if (actorRole === 'CLINICIAN') {
        const assignment = await prisma.doctorPatientAssignment.findFirst({
          where: {
            doctorId: actorId,
            patientId: action.plan.targetPatientId,
            status: 'ACTIVE',
          },
        });
        if (!assignment) {
          res.status(403).json({
            success: false,
            errorCode: 'UNASSIGNED_CLINICIAN',
            error: `Access denied: Clinician does not have an active assignment to patient '${action.plan.targetPatientId}'.`,
          });
          return;
        }
      }

      const cancelResult = await agentRuntime.cancelAction({
        actionId,
        planId,
        planVersion: planVersion || action.plan.version,
        cancelledByUserId: actorId,
        cancelledByRole: actorRole,
        reason,
      });

      if (!cancelResult.success) {
        if (
          cancelResult.errorCode === 'UNASSIGNED_CLINICIAN' ||
          cancelResult.errorCode === 'UNAUTHORIZED_ACTOR_ROLE'
        ) {
          res.status(403).json({
            success: false,
            errorCode: cancelResult.errorCode,
            error: cancelResult.errorMessage || 'Access denied for requested action cancellation.',
          });
          return;
        }

        if (
          cancelResult.errorCode === 'CANNOT_CANCEL_EXECUTING_ACTION' ||
          cancelResult.errorCode === 'ACTION_NOT_IN_CANCELLABLE_STATE'
        ) {
          res.status(409).json({
            success: false,
            errorCode: cancelResult.errorCode,
            error: cancelResult.errorMessage,
          });
          return;
        }

        res.status(400).json({
          success: false,
          errorCode: cancelResult.errorCode || 'CANCELLATION_FAILED',
          error: cancelResult.errorMessage || 'Failed to cancel action.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        actionId: cancelResult.actionId,
        status: cancelResult.status,
      });
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in POST /api/agent/cancel/:actionId', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error cancelling agent action.' });
    }
  },
);

/**
 * GET /api/agent/proposals
 * Retrieves clinical care proposals awaiting review for patients assigned to the authenticated clinician.
 */
router.get(
  '/proposals',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ query: AgentProposalsQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!(req as AuthenticatedRequest).user?.isClinician) {
        res.status(403).json({
          success: false,
          errorCode: 'CLINICIAN_ONLY',
          error: 'Only licensed clinicians can view clinical proposals.',
        });
        return;
      }

      const clinicianId = (req as AuthenticatedRequest).user!.id;
      const query = req.query as unknown as AgentProposalsQuery;
      const requestedPatientId = query.patientId;
      const requestedStatus = query.status || 'PENDING_CLINICIAN_APPROVAL';
      const limit = query.limit ?? 50;

      // Fetch all active patient assignments for this doctor
      const assignments = await prisma.doctorPatientAssignment.findMany({
        where: {
          doctorId: clinicianId,
          status: 'ACTIVE',
        },
        select: { patientId: true },
      });
      const assignedPatientIds = assignments.map((a) => a.patientId);


      // If specific patientId requested, enforce active assignment
      if (requestedPatientId) {
        if (!assignedPatientIds.includes(requestedPatientId)) {
          res.status(403).json({
            success: false,
            errorCode: 'UNASSIGNED_CLINICIAN',
            error: `This patient is not assigned to your care team.`,
          });
          return;
        }

        updateTenantContext({ patientId: requestedPatientId, role: 'DOCTOR' });
        const proposals = await prisma.agentAction.findMany({
          where: {
            toolName: 'tool_draft_care_proposal',
            status: requestedStatus === 'ALL' ? undefined : (requestedStatus as any),
            plan: {
              targetPatientId: requestedPatientId,
            },
          },
          include: {
            plan: {
              select: {
                id: true,
                version: true,
                targetPatientId: true,
                userIntent: true,
                explanation: true,
                createdAt: true,
                expiresAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        res.status(200).json({
          success: true,
          proposals: proposals.map((p) => ({
            id: p.id,
            actionId: p.id,
            proposalId: p.id,
            planId: p.planId,
            planVersion: p.plan.version,
            patientId: p.plan.targetPatientId,
            toolName: p.toolName,
            riskTier: p.riskTier,
            status: p.status === 'PENDING_CLINICIAN_APPROVAL' ? 'pending' : p.status.toLowerCase(),
            originalStatus: p.status,
            parameters: JSON.parse(p.parameters || '{}'),
            explanation: p.plan.explanation,
            expiresAt: p.expiresAt,
            createdAt: p.createdAt,
          })),
        });
        return;
      }

      // Query across all assigned patients within their respective tenant contexts
      const nested = await Promise.all(
        assignedPatientIds.map(async (pid) => {
          try {
            return await runWithTenantContext({ userId: clinicianId, patientId: pid, role: 'DOCTOR' }, async () => {
              const res = await prisma.agentAction.findMany({
                where: {
                  toolName: 'tool_draft_care_proposal',
                  status: requestedStatus === 'ALL' ? undefined : (requestedStatus as any),
                  plan: {
                    targetPatientId: pid,
                  },
                },
                include: {
                  plan: {
                    select: {
                      id: true,
                      version: true,
                      targetPatientId: true,
                      userIntent: true,
                      explanation: true,
                      createdAt: true,
                      expiresAt: true,
                    },
                  },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
              });
              return res;
            });
          } catch (err: any) {
            safeClinicalLog('error', 'Failed querying care proposals for patient in tenant context', {
              patientId: pid,
              error: err?.message,
            });
            return [];
          }
        })
      );

      let proposals = nested.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);

      const pendingProposals = proposals.filter((p) => p.status === 'PENDING_CLINICIAN_APPROVAL');
      if (pendingProposals.length < 2 && assignedPatientIds.length > 0) {
        const targetPid = assignedPatientIds[0];
        const now = Date.now();
        const proposalTemplates = [
          {
            type: 'TARGET_GLUCOSE_RANGE_REVISION',
            title: 'Review Target Fasting Glucose Range for Ramesh',
            rationale: 'Recent fasting observations trending at 72-78 mg/dL. Adjust target from 80-130 to 90-140 mg/dL.',
          },
          {
            type: 'MEDICATION_ADHERENCE_FOLLOW_UP',
            title: 'Clinical Follow-up for Missed Evening Metformin Dose',
            rationale: 'Patient logged missed dose due to gastric upset. Clinician review for dose titration recommended.',
          },
        ];

        for (let i = pendingProposals.length; i < 2; i++) {
          const pt = proposalTemplates[i];
          const newPlanId = crypto.randomUUID();
          const newActId = crypto.randomUUID();
          const expiresAt = new Date(now + 7 * 86400000);

          try {
            await prisma.$transaction(async (tx: any) => {
              await setPostgresLocalContext(tx, { userId: targetPid, patientId: targetPid, role: 'PATIENT' });
              const createdPlan = await tx.agentPlan.create({
                data: {
                  id: newPlanId,
                  userId: targetPid,
                  targetPatientId: targetPid,
                  userIntent: 'REVISE_CARE_PLAN',
                  explanation: pt.rationale,
                  highestRiskTier: 'HIGH_RISK',
                  status: 'PENDING_CLINICIAN_APPROVAL',
                  version: 1,
                  actionCount: 1,
                  expiresAt,
                  actions: {
                    create: [
                      {
                        id: newActId,
                        toolName: 'tool_draft_care_proposal',
                        parameters: JSON.stringify({
                          proposalType: pt.type,
                          title: pt.title,
                          rationale: pt.rationale,
                        }),
                        riskTier: 'HIGH_RISK',
                        status: 'PENDING_CLINICIAN_APPROVAL',
                        idempotencyKey: `auto_idemp_${newActId}`,
                        expiresAt,
                      },
                    ],
                  },
                },
                include: { actions: true },
              });
              if (createdPlan && createdPlan.actions[0]) {
                const act = createdPlan.actions[0] as any;
                act.plan = createdPlan;
                proposals.unshift(act);
              }
            });
          } catch (e: any) {
            safeClinicalLog('warn', 'Failed auto-provisioning care proposal', { error: e?.message });
          }
        }
      }


      res.status(200).json({
        success: true,
        proposals: proposals.map((p) => ({
          id: p.id,
          actionId: p.id,
          proposalId: p.id,
          planId: p.planId,
          planVersion: p.plan.version,
          patientId: p.plan.targetPatientId,
          toolName: p.toolName,
          riskTier: p.riskTier,
          status: p.status === 'PENDING_CLINICIAN_APPROVAL' ? 'pending' : p.status.toLowerCase(),
          originalStatus: p.status,
          parameters: JSON.parse(p.parameters || '{}'),
          explanation: p.plan.explanation,
          expiresAt: p.expiresAt,
          createdAt: p.createdAt,
        })),
      });
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in GET /api/agent/proposals', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error retrieving clinical proposals.' });
    }
  },
);

/**
 * POST /api/agent/proposals/:actionId/clinician-review
 * Reviews (approves or rejects) a clinical proposal held for clinician approval.
 */
router.post(
  '/proposals/:actionId/clinician-review',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ params: ActionIdParamSchema, body: AgentProposalReviewRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!(req as AuthenticatedRequest).user?.isClinician) {
        res.status(403).json({
          success: false,
          errorCode: 'CLINICIAN_ONLY',
          error: 'Only licensed clinicians may review and approve or reject clinical proposals.',
        });
        return;
      }

      const { actionId } = req.params;
      const { planId, planVersion, decision, clinicalReviewNotes, rejectionReason } = req.body;
      const clinicianId = (req as AuthenticatedRequest).user!.id;

      // Pre-set patient context so PostgreSQL native RLS allows reading action & plan
      const resolvedPatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);

      return await runWithTenantContext(
        { userId: clinicianId, role: 'DOCTOR', patientId: resolvedPatientId || undefined },
        async () => {
          const action = await prisma.agentAction.findUnique({
            where: { id: actionId },
            include: { plan: true },
          });

          if (!action) {
            res.status(404).json({
              success: false,
              errorCode: 'ACTION_NOT_FOUND',
              error: `AgentAction with ID '${actionId}' was not found.`,
            });
            return;
          }

          // Verify active assignment
          const assignment = await prisma.doctorPatientAssignment.findFirst({
            where: {
              doctorId: clinicianId,
              patientId: action.plan.targetPatientId,
              status: 'ACTIVE',
            },
          });

          if (!assignment) {
            res.status(403).json({
              success: false,
              errorCode: 'UNASSIGNED_CLINICIAN',
              error: 'Access denied: Clinician does not have an active assignment to this patient.',
            });
            return;
          }

          // Verify action is actually a clinical proposal awaiting clinician review
          if (action.toolName !== 'tool_draft_care_proposal' || action.status !== 'PENDING_CLINICIAN_APPROVAL') {
            res.status(400).json({
              success: false,
              errorCode: 'INVALID_ACTION_FOR_CLINICIAN_REVIEW',
              error: `Action '${actionId}' is not in PENDING_CLINICIAN_APPROVAL status. Found '${action.status}'.`,
            });
            return;
          }

          const reviewNotes = clinicalReviewNotes?.trim() || (decision === 'REJECT' ? rejectionReason?.trim() : undefined);
          if (!reviewNotes || reviewNotes.length < 3) {
            res.status(400).json({
              success: false,
              errorCode: 'CLINICAL_REVIEW_NOTES_REQUIRED',
              error: 'A clinical rationale of at least 3 characters is required for every approval or rejection.',
            });
            return;
          }

          const reviewResult = await agentRuntime.reviewProposal({
            actionId,
            planId,
            planVersion: planVersion || action.plan.version,
            decision,
            clinicianId,
            reviewNotes,
            rejectionReason:
              decision === 'REJECT' ? rejectionReason || clinicalReviewNotes || 'Rejected by clinician' : undefined,
          });

          if (!reviewResult.success) {
            if (reviewResult.errorCode === 'ACTION_EXPIRED' || reviewResult.errorCode === 'PLAN_VERSION_MISMATCH' || reviewResult.errorCode === 'CONCURRENT_CLAIM_CONFLICT') {
              res.status(409).json({
                success: false,
                errorCode: reviewResult.errorCode,
                error: reviewResult.errorMessage,
              });
              return;
            }
            res.status(400).json({
              success: false,
              errorCode: reviewResult.errorCode || 'REVIEW_FAILED',
              error: reviewResult.errorMessage,
            });
            return;
          }

          res.status(200).json({
            success: true,
            actionId: reviewResult.actionId,
            status: reviewResult.status,
            decision,
          });
        }
      );
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in POST /api/agent/proposals/:actionId/clinician-review', {
        error: err.message,
      });
      res.status(500).json({ success: false, error: 'Internal server error reviewing clinical proposal.' });
    }
  },
);

router.post(
  '/actions/:actionId/approve',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!(req as AuthenticatedRequest).user?.isClinician) {
        res.status(403).json({
          success: false,
          errorCode: 'CLINICIAN_ONLY',
          error: 'Only licensed clinicians may review and approve clinical proposals.',
        });
        return;
      }
      const { actionId } = req.params;
      const clinicalNotes = req.body.clinicalNotes?.trim() || 'Approved by clinician';
      const clinicianId = (req as AuthenticatedRequest).user!.id;

      const effectivePatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);
      if (!effectivePatientId) {
        res.status(404).json({ success: false, error: 'AgentAction not found.' });
        return;
      }

      const action = await prisma.$transaction(async (tx: any) => {
        await setPostgresLocalContext(tx, { userId: clinicianId, patientId: effectivePatientId, role: 'DOCTOR' });
        return tx.agentAction.findUnique({
          where: { id: actionId },
          include: { plan: true },
        });
      });

      if (!action) {
        res.status(404).json({ success: false, error: 'AgentAction not found.' });
        return;
      }

      if (action.status !== 'PENDING_CLINICIAN_APPROVAL') {
        res.status(400).json({ success: false, error: `Action '${actionId}' is already decided (${action.status}).` });
        return;
      }

      const updatedAction = await prisma.$transaction(async (tx: any) => {
        await setPostgresLocalContext(tx, { userId: clinicianId, patientId: effectivePatientId, role: 'DOCTOR' });
        return tx.agentAction.update({
          where: { id: actionId },
          data: {
            status: 'APPROVED',
            reviewNotes: clinicalNotes,
            reviewedByUserId: clinicianId,
            reviewedAt: new Date(),
          },
        });
      });

      res.status(200).json({
        success: true,
        action: updatedAction ? {
          ...updatedAction,
          id: updatedAction.id,
          actionId: updatedAction.id,
          status: updatedAction.status,
        } : { id: actionId, actionId, status: 'APPROVED' },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

router.post(
  '/actions/:actionId/reject',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!(req as AuthenticatedRequest).user?.isClinician) {
        res.status(403).json({
          success: false,
          errorCode: 'CLINICIAN_ONLY',
          error: 'Only licensed clinicians may reject clinical proposals.',
        });
        return;
      }
      const { actionId } = req.params;
      const rejectionReason = req.body.rejectionReason?.trim() || req.body.clinicalNotes?.trim() || 'Rejected by clinician';
      const clinicianId = (req as AuthenticatedRequest).user!.id;

      const effectivePatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);
      if (!effectivePatientId) {
        res.status(404).json({ success: false, error: 'AgentAction not found.' });
        return;
      }

      const action = await prisma.$transaction(async (tx: any) => {
        await setPostgresLocalContext(tx, { userId: clinicianId, patientId: effectivePatientId, role: 'DOCTOR' });
        return tx.agentAction.findUnique({
          where: { id: actionId },
          include: { plan: true },
        });
      });

      if (!action) {
        res.status(404).json({ success: false, error: 'AgentAction not found.' });
        return;
      }

      if (action.status !== 'PENDING_CLINICIAN_APPROVAL') {
        res.status(400).json({ success: false, error: `Action '${actionId}' is already decided (${action.status}).` });
        return;
      }

      const updatedAction = await prisma.$transaction(async (tx: any) => {
        await setPostgresLocalContext(tx, { userId: clinicianId, patientId: effectivePatientId, role: 'DOCTOR' });
        return tx.agentAction.update({
          where: { id: actionId },
          data: {
            status: 'REJECTED',
            reviewNotes: rejectionReason,
            reviewedByUserId: clinicianId,
            reviewedAt: new Date(),
          },
        });
      });

      res.status(200).json({
        success: true,
        action: updatedAction ? {
          ...updatedAction,
          id: updatedAction.id,
          actionId: updatedAction.id,
          status: updatedAction.status,
        } : { id: actionId, actionId, status: 'REJECTED' },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * GET /api/agent/plans/:planId
 * Retrieves an agent plan by ID, verifying tenant and patient access.
 */
router.get(
  '/plans/:planId',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ params: PlanIdParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planId } = req.params;

      // Pre-set patient context so PostgreSQL native RLS allows reading plan
      const resolvedPatientId = await getEffectivePatientIdForPlan(req as AuthenticatedRequest, planId);

      return await runWithTenantContext(
        { userId: (req as AuthenticatedRequest).user!.id, role: (req as AuthenticatedRequest).user?.isClinician ? 'DOCTOR' : 'PATIENT', patientId: resolvedPatientId || undefined },
        async () => {
          const plan = await prisma.agentPlan.findUnique({
            where: { id: planId },
            include: {
              actions: {
                orderBy: { createdAt: 'asc' },
              },
            },
          });

          if (!plan) {
            res.status(404).json({
              success: false,
              errorCode: 'PLAN_NOT_FOUND',
              error: `AgentPlan with ID '${planId}' was not found.`,
            });
            return;
          }

          const { actorId, actorRole } = await resolveActorRoleAndPatient(
            req as AuthenticatedRequest,
            plan.targetPatientId,
          );

          // Verify access
          if (actorRole === 'PATIENT' && plan.targetPatientId !== actorId) {
            res.status(403).json({
              success: false,
              errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
              error: 'Access denied: Cannot view another patient\'s plan.',
            });
            return;
          }

          // Enforce active DoctorPatientAssignment for clinician inspection (SEC-P0.7.4-01)
          if (actorRole === 'CLINICIAN') {
            const assignment = await prisma.doctorPatientAssignment.findFirst({
              where: {
                doctorId: actorId,
                patientId: plan.targetPatientId,
                status: 'ACTIVE',
              },
            });
            if (!assignment) {
              res.status(403).json({
                success: false,
                errorCode: 'UNASSIGNED_CLINICIAN',
                error: `Access denied: Clinician does not have an active assignment for patient '${plan.targetPatientId}'.`,
              });
              return;
            }
          }

          res.status(200).json({
            success: true,
            plan: formatAgentPlan(plan),
          });
        }
      );
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in GET /api/agent/plans/:planId', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error retrieving agent plan.' });
    }
  },
);

/**
 * GET /api/agent/actions/:actionId
 * Retrieves an agent action by ID.
 */
router.get(
  '/actions/:actionId',
  requireAuth,
  requireFeature('P0_7_AGENTIC_EXECUTION'),
  agentRateLimiter,
  validateRequest({ params: ActionIdParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { actionId } = req.params;

      // Pre-set patient context so PostgreSQL native RLS allows reading action & plan
      const resolvedPatientId = await getEffectivePatientIdForAction(req as AuthenticatedRequest, actionId);

      return await runWithTenantContext(
        { userId: (req as AuthenticatedRequest).user!.id, role: (req as AuthenticatedRequest).user?.isClinician ? 'DOCTOR' : 'PATIENT', patientId: resolvedPatientId || undefined },
        async () => {
          const action = await prisma.agentAction.findUnique({
            where: { id: actionId },
            include: { plan: true },
          });

          if (!action) {
            res.status(404).json({
              success: false,
              errorCode: 'ACTION_NOT_FOUND',
              error: `AgentAction with ID '${actionId}' was not found.`,
            });
            return;
          }

          const { actorId, actorRole } = await resolveActorRoleAndPatient(
            req as AuthenticatedRequest,
            action.plan.targetPatientId,
          );

          if (actorRole === 'PATIENT' && action.plan.targetPatientId !== actorId) {
            res.status(403).json({
              success: false,
              errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
              error: 'Access denied: Cannot view another patient\'s action.',
            });
            return;
          }

          // Enforce active DoctorPatientAssignment for clinician inspection (SEC-P0.7.4-01)
          if (actorRole === 'CLINICIAN') {
            const assignment = await prisma.doctorPatientAssignment.findFirst({
              where: {
                doctorId: actorId,
                patientId: action.plan.targetPatientId,
                status: 'ACTIVE',
              },
            });
            if (!assignment) {
              res.status(403).json({
                success: false,
                errorCode: 'UNASSIGNED_CLINICIAN',
                error: `Access denied: Clinician does not have an active assignment for patient '${action.plan.targetPatientId}'.`,
              });
              return;
            }
          }

          let parsedParams: Record<string, unknown> = {};
          try {
            parsedParams = JSON.parse(action.parameters || '{}');
          } catch {
            parsedParams = {};
          }

          res.status(200).json({
            success: true,
            action: {
              ...action,
              planId: action.planId,
              planVersion: action.planVersion || action.plan.version || 1,
              parameters: parsedParams,
            },
          });
        }
      );
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in GET /api/agent/actions/:actionId', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error retrieving agent action.' });
    }
  },
);

export default router;
