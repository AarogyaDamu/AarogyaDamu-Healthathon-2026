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
import { prisma } from '../server';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { agentRuntime } from '../ai/agent/agentRuntime';
import { formatAgentPlan } from '../ai/agent/agentPlanner';

const router = Router();

// Rate limiter: 100 requests per 15 minutes per user
const agentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('agent_route_limit:', 15 * 60 * 1000),
  keyGenerator: (req) => {
    return (req as AuthenticatedRequest).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'Too many agent requests. Please wait a few minutes before trying again.',
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
 * Prevents client-side role or permission spoofing.
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
    return { actorId, targetPatientId, actorRole: 'CLINICIAN' };
  }

  if (actorId === targetPatientId) {
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
      return { actorId, targetPatientId, actorRole: 'CAREGIVER' };
    }
  }

  // Without caregiver consent, role remains PATIENT which fails closed in authorization
  return { actorId, targetPatientId, actorRole: 'PATIENT' };
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
            error: `Access denied: Clinician does not have an active assignment for patient '${requestedPatientId}'.`,
          });
          return;
        }
      }

      const filterPatientIds = requestedPatientId ? [requestedPatientId] : assignedPatientIds;

      const proposals = await prisma.agentAction.findMany({
        where: {
          toolName: 'tool_draft_care_proposal',
          status: requestedStatus === 'ALL' ? undefined : (requestedStatus as any),
          plan: {
            targetPatientId: { in: filterPatientIds },
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
          actionId: p.id,
          planId: p.planId,
          planVersion: p.plan.version,
          patientId: p.plan.targetPatientId,
          toolName: p.toolName,
          riskTier: p.riskTier,
          status: p.status,
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
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in POST /api/agent/proposals/:actionId/clinician-review', {
        error: err.message,
      });
      res.status(500).json({ success: false, error: 'Internal server error reviewing clinical proposal.' });
    }
  },
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
    } catch (err: any) {
      safeClinicalLog('error', 'Unhandled error in GET /api/agent/actions/:actionId', { error: err.message });
      res.status(500).json({ success: false, error: 'Internal server error retrieving agent action.' });
    }
  },
);

export default router;
