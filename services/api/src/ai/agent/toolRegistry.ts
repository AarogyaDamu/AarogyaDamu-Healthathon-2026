import {
  AgentToolName,
  AgentToolNameEnum,
  AgentRiskTier,
  getDeterministicToolRiskTier,
  validateToolParameters,
  AGENT_TOOL_REQUIRED_PERMISSIONS,
  CaregiverPermission,
} from '@aarogyadamu/contracts';

export interface RegisteredToolDefinition {
  name: AgentToolName;
  riskTier: AgentRiskTier;
  requiredCaregiverPermission: CaregiverPermission;
  requiresPatientConfirmation: boolean;
  requiresClinicianApproval: boolean;
  description: string;
}

export const REGISTERED_AGENT_TOOLS: Record<AgentToolName, RegisteredToolDefinition> = {
  tool_schedule_care_task: {
    name: 'tool_schedule_care_task',
    riskTier: getDeterministicToolRiskTier('tool_schedule_care_task'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_schedule_care_task,
    requiresPatientConfirmation: true,
    requiresClinicianApproval: false,
    description: 'Schedules a diabetes self-management care task (e.g. glucose check, foot exam).',
  },
  tool_schedule_reminder: {
    name: 'tool_schedule_reminder',
    riskTier: getDeterministicToolRiskTier('tool_schedule_reminder'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_schedule_reminder,
    requiresPatientConfirmation: true,
    requiresClinicianApproval: false,
    description: 'Schedules a personalized medication, meal, or lifestyle reminder.',
  },
  tool_request_appointment: {
    name: 'tool_request_appointment',
    riskTier: getDeterministicToolRiskTier('tool_request_appointment'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_request_appointment,
    requiresPatientConfirmation: true,
    requiresClinicianApproval: false,
    description: 'Requests a formal appointment or clinical checkup with an assigned doctor.',
  },
  tool_log_lifestyle_record: {
    name: 'tool_log_lifestyle_record',
    riskTier: getDeterministicToolRiskTier('tool_log_lifestyle_record'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_log_lifestyle_record,
    requiresPatientConfirmation: true,
    requiresClinicianApproval: false,
    description: 'Logs physical activity, nutrition, hydration, or sleep records.',
  },
  tool_draft_care_proposal: {
    name: 'tool_draft_care_proposal',
    riskTier: getDeterministicToolRiskTier('tool_draft_care_proposal'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_draft_care_proposal,
    requiresPatientConfirmation: false,
    requiresClinicianApproval: true,
    description: 'Drafts a clinical care proposal (e.g. dosage review, target range revision) for licensed clinician review.',
  },
  tool_query_health_summary: {
    name: 'tool_query_health_summary',
    riskTier: getDeterministicToolRiskTier('tool_query_health_summary'),
    requiredCaregiverPermission: AGENT_TOOL_REQUIRED_PERMISSIONS.tool_query_health_summary,
    requiresPatientConfirmation: false,
    requiresClinicianApproval: false,
    description: 'Queries recent blood glucose, blood pressure, weight, or HbA1c metrics read-only.',
  },
};

/**
 * Validates if a tool name is officially registered and allowlisted.
 */
export function isAllowlistedTool(toolName: string): toolName is AgentToolName {
  return AgentToolNameEnum.options.includes(toolName as AgentToolName);
}

/**
 * Retrieves the tool definition or throws if the tool is unrecognized.
 */
export function getRegisteredTool(toolName: string): RegisteredToolDefinition {
  if (!isAllowlistedTool(toolName)) {
    throw new Error(`Unauthorized or unrecognized agent tool: '${toolName}'. Execution is strictly prohibited.`);
  }
  return REGISTERED_AGENT_TOOLS[toolName];
}

/**
 * Validates parameters for any registered tool.
 */
export function validateRegisteredToolParameters(toolName: string, rawParams: unknown): Record<string, unknown> {
  if (!isAllowlistedTool(toolName)) {
    throw new Error(`Cannot validate parameters for unrecognized tool: '${toolName}'.`);
  }
  return validateToolParameters(toolName, rawParams);
}

