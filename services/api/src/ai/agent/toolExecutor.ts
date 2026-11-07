import { prisma } from '../../server';
import {
  AgentToolName,
  ToolScheduleCareTaskParams,
  ToolScheduleReminderParams,
  ToolRequestAppointmentParams,
  ToolLogLifestyleRecordParams,
  ToolDraftCareProposalParams,
  ToolQueryHealthSummaryParams,
} from '@aarogyadamu/contracts';
import { getRegisteredTool, isAllowlistedTool, validateRegisteredToolParameters } from './toolRegistry';

export interface ToolExecutionContext {
  actorId: string;
  targetPatientId: string;
  actorRole: 'PATIENT' | 'CAREGIVER' | 'CLINICIAN' | 'ADMIN';
  idempotencyKey: string;
  actionId?: string;
  planId?: string;
}

export interface ToolExecutionResult {
  success: boolean;
  toolName: AgentToolName;
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Concrete executor for the 6 allowlisted agent tools.
 * All mutations enforce tenant/patient binding, strict defensive parameter validation,
 * and idempotent uniqueness.
 */
export async function executeAgentTool(
  toolName: AgentToolName,
  params: Record<string, unknown>,
  context: ToolExecutionContext,
): Promise<ToolExecutionResult> {
  // 1. Strict tool allowlist resolution
  if (!isAllowlistedTool(toolName)) {
    return {
      success: false,
      toolName,
      errorCode: 'UNAUTHORIZED_TOOL',
      errorMessage: `Tool '${toolName}' is not an approved allowlisted tool. Execution is strictly prohibited.`,
    };
  }

  // 2. Defensive Zod parameter validation directly at execution boundary (SEC-P0.7.3-01)
  let validatedParams: Record<string, unknown>;
  try {
    validatedParams = validateRegisteredToolParameters(toolName, params);
  } catch (err: any) {
    return {
      success: false,
      toolName,
      errorCode: 'INVALID_TOOL_PARAMETERS',
      errorMessage: `Execution boundary parameter validation failed for tool '${toolName}': ${err.message}`,
    };
  }

  try {
    switch (toolName) {
      case 'tool_schedule_care_task': {
        const p = validatedParams as unknown as ToolScheduleCareTaskParams;
        // Check if task already exists with this idempotency key
        const existing = await prisma.careTask.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
        });

        if (existing) {
          return {
            success: true,
            toolName,
            result: {
              taskId: existing.id,
              title: existing.title,
              category: existing.category,
              instructions: existing.instructions,
              dueAt: existing.dueAt.toISOString(),
              status: existing.status,
              userId: existing.userId,
              assignedById: existing.assignedById,
              replayed: true,
            },
          };
        }

        const task = await prisma.careTask.create({
          data: {
            userId: context.targetPatientId,
            assignedById: context.actorId,
            title: p.title,
            category: p.category,
            instructions: p.notes || null,
            dueAt: new Date(p.dueAt),
            carePlanId: p.carePlanId || null,
            idempotencyKey: context.idempotencyKey,
            status: 'PENDING',
          },
        });

        return {
          success: true,
          toolName,
          result: {
            taskId: task.id,
            title: task.title,
            category: task.category,
            instructions: task.instructions,
            dueAt: task.dueAt.toISOString(),
            status: task.status,
            userId: task.userId,
            assignedById: task.assignedById,
          },
        };
      }

      case 'tool_schedule_reminder': {
        const p = validatedParams as unknown as ToolScheduleReminderParams;
        const existing = await prisma.reminder.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
        });

        if (existing) {
          return {
            success: true,
            toolName,
            result: {
              reminderId: existing.id,
              title: existing.title,
              remindAt: existing.remindAt.toISOString(),
              status: existing.status,
              replayed: true,
            },
          };
        }

        const reminder = await prisma.reminder.create({
          data: {
            userId: context.targetPatientId,
            createdById: context.actorId,
            title: p.title,
            category: p.category,
            remindAt: new Date(p.remindAt),
            timezone: p.timezone || null,
            recurrence: p.recurrence,
            notes: p.notes || null,
            idempotencyKey: context.idempotencyKey,
            status: 'SCHEDULED',
          },
        });

        return {
          success: true,
          toolName,
          result: {
            reminderId: reminder.id,
            title: reminder.title,
            category: reminder.category,
            remindAt: reminder.remindAt.toISOString(),
            recurrence: reminder.recurrence,
            status: reminder.status,
          },
        };
      }

      case 'tool_request_appointment': {
        const p = validatedParams as unknown as ToolRequestAppointmentParams;
        const existing = await prisma.appointment.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
        });

        if (existing) {
          return {
            success: true,
            toolName,
            result: {
              appointmentId: existing.id,
              scheduledAt: existing.scheduledAt.toISOString(),
              status: existing.status,
              replayed: true,
            },
          };
        }

        const appointment = await prisma.appointment.create({
          data: {
            patientId: context.targetPatientId,
            doctorId: p.doctorId,
            bookedById: context.actorId,
            scheduledAt: new Date(p.scheduledAt),
            durationMinutes: p.durationMinutes,
            reason: p.reason,
            visitType: p.visitType,
            status: 'REQUESTED',
            notes: p.notes || null,
            idempotencyKey: context.idempotencyKey,
          },
        });

        return {
          success: true,
          toolName,
          result: {
            appointmentId: appointment.id,
            doctorId: appointment.doctorId,
            scheduledAt: appointment.scheduledAt.toISOString(),
            durationMinutes: appointment.durationMinutes,
            status: appointment.status,
          },
        };
      }

      case 'tool_log_lifestyle_record': {
        const p = validatedParams as unknown as ToolLogLifestyleRecordParams;
        const existing = await prisma.lifestyleRecord.findUnique({
          where: { idempotencyKey: context.idempotencyKey },
        });

        if (existing) {
          return {
            success: true,
            toolName,
            result: {
              recordId: existing.id,
              category: existing.category,
              recordedAt: existing.recordedAt.toISOString(),
              replayed: true,
            },
          };
        }

        const record = await prisma.lifestyleRecord.create({
          data: {
            userId: context.targetPatientId,
            createdById: context.actorId,
            category: p.category,
            numericValue: p.numericValue ?? null,
            unit: p.unit || null,
            qualitativeValue: p.qualitativeValue || null,
            notes: p.notes || null,
            recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
            timezone: p.timezone || null,
            source: context.actorRole === 'CAREGIVER' ? 'CAREGIVER_INPUT' : 'MANUAL_PATIENT',
            idempotencyKey: context.idempotencyKey,
          },
        });

        return {
          success: true,
          toolName,
          result: {
            recordId: record.id,
            category: record.category,
            numericValue: record.numericValue,
            unit: record.unit,
            recordedAt: record.recordedAt.toISOString(),
          },
        };
      }

      case 'tool_draft_care_proposal': {
        const p = validatedParams as unknown as ToolDraftCareProposalParams;

        // HIGH_RISK: Creates an auditable care proposal record held for clinician approval
        const auditRecord = await prisma.agentAuditRecord.create({
          data: {
            userId: context.targetPatientId,
            agentName: 'Damu',
            riskTier: 'HIGH_RISK',
            actionType: 'CLINICAL_CARE_PROPOSAL',
            summary: p.title,
            payload: JSON.stringify({
              proposalType: p.proposalType,
              rationale: p.rationale,
              proposedDetails: p.proposedDetails,
              proposedBy: context.actorId,
              idempotencyKey: context.idempotencyKey,
            }),
            requiresClinicianApproval: true,
            approvalStatus: 'PENDING',
          },
        });

        return {
          success: true,
          toolName,
          result: {
            proposalId: auditRecord.id,
            proposalType: p.proposalType,
            title: p.title,
            requiresClinicianApproval: true,
            approvalStatus: 'PENDING',
          },
        };
      }

      case 'tool_query_health_summary': {
        const p = validatedParams as unknown as ToolQueryHealthSummaryParams;
        const days = p.timeRangeDays || 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const observations = await prisma.healthObservation.findMany({
          where: {
            userId: context.targetPatientId,
            type: p.metric === 'ALL' ? undefined : p.metric,
            observedAt: { gte: since },
          },
          orderBy: { observedAt: 'desc' },
          take: 50,
        });

        const total = observations.length;
        const avg =
          total > 0
            ? Math.round((observations.reduce((acc, curr) => acc + curr.numericValue, 0) / total) * 10) / 10
            : null;

        return {
          success: true,
          toolName,
          result: {
            metric: p.metric,
            timeRangeDays: days,
            totalObservations: total,
            averageValue: avg,
            latestObservation: observations[0]
              ? {
                  type: observations[0].type,
                  numericValue: observations[0].numericValue,
                  secondaryValue: observations[0].secondaryValue,
                  unit: observations[0].unit,
                  clinicalFlag: observations[0].clinicalFlag,
                  observedAt: observations[0].observedAt.toISOString(),
                }
              : null,
          },
        };
      }

      default:
        return {
          success: false,
          toolName,
          errorCode: 'UNSUPPORTED_TOOL',
          errorMessage: `Tool '${toolName}' is not supported by executor.`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      toolName,
      errorCode: err.code || 'TOOL_EXECUTION_ERROR',
      errorMessage: err.message || 'An error occurred during tool execution.',
    };
  }
}
