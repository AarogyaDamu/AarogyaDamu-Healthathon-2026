import { mobileApiFetch } from './client';
import {
  AgentPlanRequest,
  AgentPlanResponse,
  AgentActionItem,
  AgentActionConfirmRequest,
  AgentActionCancelRequest,
  AgentRiskTier,
  AgentActionStatus,
  AgentPlanStatus,
  AgentToolName,
} from '@aarogyadamu/contracts';

/* -------------------------------------------------------------------------- */
/* Types & Interfaces                                                         */
/* -------------------------------------------------------------------------- */

export interface AgentPlanGenerateResult {
  success: boolean;
  planId?: string;
  plan?: AgentPlanResponse;
  hasEmergency?: boolean;
  emergencyNotice?: string;
  isProhibited?: boolean;
  prohibitedRefusal?: {
    category: string;
    reason: string;
    safeAlternative?: string;
  };
  errorCode?: string;
  error?: string;
}

export interface AgentActionConfirmResult {
  success: boolean;
  actionId?: string;
  status?: AgentActionStatus;
  replayed?: boolean;
  executionResult?: Record<string, unknown>;
  hasEmergency?: boolean;
  emergencyNotice?: string;
  errorCode?: string;
  error?: string;
}

export interface AgentActionCancelResult {
  success: boolean;
  actionId?: string;
  status?: AgentActionStatus;
  errorCode?: string;
  error?: string;
}

export interface AgentPlanDetailResult {
  success: boolean;
  plan?: AgentPlanResponse & {
    id: string;
    actions: AgentActionItem[];
  };
  errorCode?: string;
  error?: string;
}

export interface AgentActionDetailResult {
  success: boolean;
  action?: AgentActionItem & {
    plan?: {
      id: string;
      version: number;
      targetPatientId: string;
      status: AgentPlanStatus;
    };
  };
  errorCode?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* RFC 4122 v4 UUID Generator                                                */
/* -------------------------------------------------------------------------- */

/**
 * Generates an RFC 4122 v4 UUID string suitable for idempotency keys.
 * Uses cryptographically secure randomness (Web Crypto API or getRandomValues).
 * Strictly refuses insecure Math.random fallback.
 */
export function generateUUID(): string {
  // 1. Native crypto.randomUUID (modern browsers, Hermes with polyfill, Node 19+)
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // 2. Cryptographic getRandomValues (standard Web Crypto / React Native crypto)
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 v4 version
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // 3. Refuse silent insecure Math.random fallback for idempotency keys
  throw new Error('Cryptographically secure randomness is unavailable; refusing insecure Math.random fallback for idempotency keys.');
}

/* -------------------------------------------------------------------------- */
/* Human-Friendly UI Metadata Helpers                                         */
/* -------------------------------------------------------------------------- */

export function getToolDisplayName(toolName: AgentToolName | string): string {
  switch (toolName) {
    case 'tool_schedule_care_task':
      return 'Schedule Care Task';
    case 'tool_schedule_reminder':
      return 'Schedule Medication Reminder';
    case 'tool_request_appointment':
      return 'Request Doctor Appointment';
    case 'tool_log_lifestyle_record':
      return 'Log Lifestyle Record';
    case 'tool_query_health_summary':
      return 'Query Health Summary';
    case 'tool_log_health_vital':
      return 'Log Health Vital';
    case 'tool_draft_care_proposal':
      return 'Draft Clinical Care Proposal';
    default:
      return toolName;
  }
}

export interface RiskTierBadgeConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export function getRiskTierConfig(riskTier: AgentRiskTier | string): RiskTierBadgeConfig {
  switch (riskTier) {
    case 'LOW_RISK':
      return {
        label: 'Low Risk',
        color: '#0F766E',
        bgColor: '#F0FDFA',
        borderColor: '#99F6E4',
      };
    case 'MEDIUM_RISK':
      return {
        label: 'Medium Risk',
        color: '#B45309',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
      };
    case 'HIGH_RISK':
      return {
        label: 'High Risk (Doctor Gated)',
        color: '#B91C1C',
        bgColor: '#FEF2F2',
        borderColor: '#FECDD3',
      };
    default:
      return {
        label: riskTier,
        color: '#475569',
        bgColor: '#F1F5F9',
        borderColor: '#CBD5E1',
      };
  }
}

export interface ActionStatusBadgeConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  isFinal: boolean;
}

export function getActionStatusConfig(status: AgentActionStatus | string): ActionStatusBadgeConfig {
  switch (status) {
    case 'AWAITING_CONFIRMATION':
      return {
        label: 'Awaiting Your Confirmation',
        color: '#B45309',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
        isFinal: false,
      };
    case 'PENDING_CLINICIAN_APPROVAL':
      return {
        label: 'Pending Doctor Review',
        color: '#1D4ED8',
        bgColor: '#EFF6FF',
        borderColor: '#BFDBFE',
        isFinal: false,
      };
    case 'EXECUTING':
      return {
        label: 'Executing...',
        color: '#0F766E',
        bgColor: '#F0FDFA',
        borderColor: '#99F6E4',
        isFinal: false,
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        color: '#15803D',
        bgColor: '#DCFCE7',
        borderColor: '#BBF7D0',
        isFinal: true,
      };
    case 'PARTIALLY_EXECUTED':
      return {
        label: 'Partially Executed',
        color: '#B45309',
        bgColor: '#FEF3C7',
        borderColor: '#FDE68A',
        isFinal: true,
      };
    case 'CANCELLED':
      return {
        label: 'Cancelled',
        color: '#475569',
        bgColor: '#F1F5F9',
        borderColor: '#CBD5E1',
        isFinal: true,
      };
    case 'EXPIRED':
      return {
        label: 'Expired',
        color: '#64748B',
        bgColor: '#F8FAFC',
        borderColor: '#E2E8F0',
        isFinal: true,
      };
    case 'FAILED':
      return {
        label: 'Failed',
        color: '#B91C1C',
        bgColor: '#FEF2F2',
        borderColor: '#FECDD3',
        isFinal: true,
      };
    case 'REJECTED':
      return {
        label: 'Rejected by Doctor',
        color: '#B91C1C',
        bgColor: '#FEF2F2',
        borderColor: '#FECDD3',
        isFinal: true,
      };
    case 'EMERGENCY_ABORTED':
      return {
        label: 'Halted (Emergency Alert)',
        color: '#991B1B',
        bgColor: '#FEE2E2',
        borderColor: '#F87171',
        isFinal: true,
      };
    case 'PROHIBITED_REFUSED':
      return {
        label: 'Prohibited Clinical Action',
        color: '#991B1B',
        bgColor: '#FEE2E2',
        borderColor: '#FCA5A5',
        isFinal: true,
      };
    default:
      return {
        label: status,
        color: '#475569',
        bgColor: '#F1F5F9',
        borderColor: '#E2E8F0',
        isFinal: false,
      };
  }
}

/**
 * Transforms raw parameters dictionary into human-readable key-value pairs for patient inspection.
 */
export function formatActionParameters(
  toolName: AgentToolName | string,
  parameters: Record<string, unknown> | string,
): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [];

  let parsed: Record<string, unknown> = {};
  if (typeof parameters === 'string') {
    try {
      parsed = JSON.parse(parameters);
    } catch {
      return fields;
    }
  } else if (parameters && typeof parameters === 'object') {
    parsed = parameters;
  } else {
    return fields;
  }

  const formatDate = (val: unknown): string => {
    if (typeof val === 'string') {
      try {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          return d.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      } catch {}
      return val;
    }
    return String(val || '');
  };

  switch (toolName) {
    case 'tool_schedule_care_task':
      if (parsed.title) fields.push({ label: 'Task Title', value: String(parsed.title) });
      if (parsed.category) fields.push({ label: 'Category', value: String(parsed.category).replace(/_/g, ' ') });
      if (parsed.dueAt) fields.push({ label: 'Due Date', value: formatDate(parsed.dueAt) });
      if (parsed.description) fields.push({ label: 'Instructions', value: String(parsed.description) });
      if (parsed.notes) fields.push({ label: 'Notes', value: String(parsed.notes) });
      break;

    case 'tool_schedule_reminder':
      if (parsed.title) fields.push({ label: 'Reminder', value: String(parsed.title) });
      if (parsed.scheduledTime) fields.push({ label: 'Time', value: formatDate(parsed.scheduledTime) });
      if (parsed.recurrencePattern) fields.push({ label: 'Frequency', value: String(parsed.recurrencePattern).replace(/_/g, ' ') });
      if (parsed.medicationName) fields.push({ label: 'Medication', value: String(parsed.medicationName) });
      if (parsed.message) fields.push({ label: 'Note', value: String(parsed.message) });
      break;

    case 'tool_request_appointment':
      if (parsed.doctorName) fields.push({ label: 'Doctor', value: String(parsed.doctorName) });
      if (parsed.specialty) fields.push({ label: 'Specialty', value: String(parsed.specialty) });
      if (parsed.preferredDate) fields.push({ label: 'Preferred Date', value: formatDate(parsed.preferredDate) });
      if (parsed.preferredTimeSlot) fields.push({ label: 'Time Slot', value: String(parsed.preferredTimeSlot) });
      if (parsed.reasonForVisit) fields.push({ label: 'Reason', value: String(parsed.reasonForVisit) });
      break;

    case 'tool_log_lifestyle_record':
      if (parsed.category) fields.push({ label: 'Category', value: String(parsed.category).replace(/_/g, ' ') });
      if (parsed.numericValue !== undefined && parsed.numericValue !== null) {
        const unit = parsed.unit ? ` ${parsed.unit}` : '';
        fields.push({ label: 'Measurement', value: `${parsed.numericValue}${unit}` });
      }
      if (parsed.qualitativeValue) fields.push({ label: 'Details', value: String(parsed.qualitativeValue) });
      if (parsed.recordedAt) fields.push({ label: 'Recorded At', value: formatDate(parsed.recordedAt) });
      if (parsed.notes) fields.push({ label: 'Notes', value: String(parsed.notes) });
      break;

    case 'tool_query_health_summary':
      if (parsed.timeRangeDays !== undefined && parsed.timeRangeDays !== null) {
        fields.push({ label: 'Time Range', value: `Past ${parsed.timeRangeDays} days` });
      }
      if (parsed.metricFilter) {
        fields.push({ label: 'Metric Filter', value: String(parsed.metricFilter).replace(/_/g, ' ') });
      }
      if (parsed.notes) {
        fields.push({ label: 'Notes', value: String(parsed.notes) });
      }
      break;

    case 'tool_log_health_vital':
      if (parsed.vitalType) fields.push({ label: 'Vital Type', value: String(parsed.vitalType).replace(/_/g, ' ') });
      if (parsed.numericValue !== undefined && parsed.numericValue !== null) {
        const sec = parsed.secondaryValue ? `/${parsed.secondaryValue}` : '';
        const unit = parsed.unit ? ` ${parsed.unit}` : '';
        fields.push({ label: 'Reading', value: `${parsed.numericValue}${sec}${unit}` });
      }
      if (parsed.context) fields.push({ label: 'Context', value: String(parsed.context).replace(/_/g, ' ') });
      if (parsed.measuredAt) fields.push({ label: 'Measured At', value: formatDate(parsed.measuredAt) });
      if (parsed.notes) fields.push({ label: 'Notes', value: String(parsed.notes) });
      break;

    case 'tool_draft_care_proposal':
      if (parsed.proposalTitle) fields.push({ label: 'Proposal Title', value: String(parsed.proposalTitle) });
      if (parsed.proposalCategory) fields.push({ label: 'Category', value: String(parsed.proposalCategory).replace(/_/g, ' ') });
      if (parsed.proposedModifications) fields.push({ label: 'Proposed Changes', value: String(parsed.proposedModifications) });
      if (parsed.clinicalJustification) fields.push({ label: 'Clinical Justification', value: String(parsed.clinicalJustification) });
      break;

    default:
      Object.entries(parsed).forEach(([k, v]) => {
        if (v !== undefined && v !== null && typeof v !== 'object') {
          fields.push({ label: k, value: String(v) });
        }
      });
      break;
  }

  return fields;
}

/* -------------------------------------------------------------------------- */
/* Agent Service Client Methods                                               */
/* -------------------------------------------------------------------------- */

export const AgentService = {
  /**
   * Generates a governed agent plan from user query.
   * Bound to authenticated patient or authorized caregiver.
   */
  async generatePlan(
    payload: AgentPlanRequest,
    targetPatientIdHeader?: string,
  ): Promise<AgentPlanGenerateResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (targetPatientIdHeader) {
        headers['x-target-patient-id'] = targetPatientIdHeader;
      }

      const response = await mobileApiFetch<AgentPlanGenerateResult>('/agent/plan', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      return response;
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate agent plan.';

      // Map common error strings
      if (msg.includes('403') || msg.includes('Access denied') || msg.includes('caregiver')) {
        return {
          success: false,
          errorCode: 'FORBIDDEN',
          error: 'Access denied: You do not have active authorization to plan actions for this patient.',
        };
      }
      if (msg.includes('429') || msg.includes('Too many')) {
        return {
          success: false,
          errorCode: 'RATE_LIMITED',
          error: 'Too many agent requests. Please wait a moment before trying again.',
        };
      }

      return {
        success: false,
        errorCode: 'PLAN_GENERATION_FAILED',
        error: msg,
      };
    }
  },

  /**
   * Confirms an agent action for execution.
   * Strict binding to actionId, planId, planVersion, and UUID idempotencyKey.
   */
  async confirmAction(
    actionId: string,
    payload: AgentActionConfirmRequest,
  ): Promise<AgentActionConfirmResult> {
    try {
      const response = await mobileApiFetch<AgentActionConfirmResult>(`/agent/execute/${actionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return response;
    } catch (err: any) {
      const msg = err?.message || 'Failed to confirm agent action.';

      if (msg.includes('409') || msg.includes('conflict') || msg.includes('status')) {
        return {
          success: false,
          actionId,
          errorCode: 'ACTION_CONFLICT',
          error: msg.includes('expired')
            ? 'This action has expired and cannot be executed.'
            : 'Action cannot be confirmed because its status has changed or conflicts with the current plan state.',
        };
      }
      if (msg.includes('403') || msg.includes('clinician') || msg.includes('denied')) {
        return {
          success: false,
          actionId,
          errorCode: 'ACTION_REQUIRES_CLINICIAN_APPROVAL',
          error: 'This action modifies clinical care and requires doctor review. Patients cannot confirm it directly.',
        };
      }
      if (msg.includes('429') || msg.includes('Too many')) {
        return {
          success: false,
          actionId,
          errorCode: 'RATE_LIMITED',
          error: 'Too many confirmation attempts. Please wait a moment and try again.',
        };
      }

      return {
        success: false,
        actionId,
        errorCode: 'EXECUTION_FAILED',
        error: msg,
      };
    }
  },

  /**
   * Cancels an eligible pending action with a mandatory reason.
   */
  async cancelAction(
    actionId: string,
    payload: AgentActionCancelRequest,
  ): Promise<AgentActionCancelResult> {
    try {
      const response = await mobileApiFetch<AgentActionCancelResult>(`/agent/cancel/${actionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return response;
    } catch (err: any) {
      const msg = err?.message || 'Failed to cancel action.';

      if (msg.includes('CANNOT_CANCEL_EXECUTING_ACTION') || msg.includes('executing')) {
        return {
          success: false,
          actionId,
          errorCode: 'CANNOT_CANCEL_EXECUTING_ACTION',
          error: 'Action is currently executing and cannot be cancelled.',
        };
      }

      return {
        success: false,
        actionId,
        errorCode: 'CANCELLATION_FAILED',
        error: msg,
      };
    }
  },

  /**
   * Retrieves an agent plan and its actions.
   */
  async getPlan(planId: string): Promise<AgentPlanDetailResult> {
    try {
      const response = await mobileApiFetch<AgentPlanDetailResult>(`/agent/plans/${planId}`);
      return response;
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'PLAN_FETCH_FAILED',
        error: err?.message || 'Failed to retrieve agent plan.',
      };
    }
  },

  /**
   * Retrieves an individual agent action.
   */
  async getAction(actionId: string): Promise<AgentActionDetailResult> {
    try {
      const response = await mobileApiFetch<AgentActionDetailResult>(`/agent/actions/${actionId}`);
      return response;
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'ACTION_FETCH_FAILED',
        error: err?.message || 'Failed to retrieve agent action.',
      };
    }
  },
};
