import { AgentRiskTier } from '@aarogyadamu/contracts';

export interface RiskClassification {
  riskTier: AgentRiskTier;
  requiresClinicianApproval: boolean;
  requiresPatientConsent: boolean;
  canAutoExecute: boolean;
  reason: string;
}

const PROHIBITED_KEYWORDS = [
  'prescribe',
  'diagnose',
  'alter_dose',
  'change_insulin',
  'stop_medication',
  'bypass_consent',
  'delete_audit',
  'impersonate_doctor',
];

const HIGH_RISK_ACTION_TYPES = [
  'MEDICATION_CHANGE_PROPOSAL',
  'CLINICAL_NOTE_DRAFT',
  'CARE_PLAN_TARGET_MODIFICATION',
  'LAB_ORDER_PROPOSAL',
  'EMERGENCY_ESCALATION_TRIGGER',
];

const MEDIUM_RISK_ACTION_TYPES = [
  'SCHEDULE_FOLLOW_UP',
  'CREATE_CARE_TASK',
  'SEND_CAREGIVER_NOTIFICATION',
  'GENERATE_MEAL_PLAN',
  'UPDATE_REMINDER_PREFERENCE',
];

const LOW_RISK_ACTION_TYPES = [
  'INFORMATIONAL_QUERY',
  'DIABETES_EDUCATION',
  'LOG_CONFIRMATION',
  'VIEW_TREND_SUMMARY',
  'METABOLIC_EXPLANATION',
];

export function classifyAgentIntent(actionType: string, payload?: Record<string, unknown>): RiskClassification {
  const normalizedAction = (actionType || '').toUpperCase().trim();
  const serialized = JSON.stringify(payload || {}).toLowerCase();

  // Check for prohibited intents
  for (const keyword of PROHIBITED_KEYWORDS) {
    if (normalizedAction.toLowerCase().includes(keyword) || serialized.includes(keyword)) {
      if (
        normalizedAction.includes('PROPOSAL') ||
        normalizedAction.includes('DRAFT') ||
        normalizedAction.includes('SUGGESTION')
      ) {
        // High risk if explicitly framed as a proposal needing doctor review
        return {
          riskTier: 'HIGH_RISK',
          requiresClinicianApproval: true,
          requiresPatientConsent: true,
          canAutoExecute: false,
          reason: 'Medication or clinical alterations require explicit, licensed clinician sign-off.',
        };
      }

      return {
        riskTier: 'PROHIBITED',
        requiresClinicianApproval: true,
        requiresPatientConsent: true,
        canAutoExecute: false,
        reason: 'Autonomous medical diagnosis, prescription, or dosage alteration without clinician approval is strictly prohibited.',
      };
    }
  }

  // Check High Risk
  if (HIGH_RISK_ACTION_TYPES.includes(normalizedAction)) {
    return {
      riskTier: 'HIGH_RISK',
      requiresClinicianApproval: true,
      requiresPatientConsent: true,
      canAutoExecute: false,
      reason: 'Clinical care modifications mandate licensed doctor verification.',
    };
  }

  // Check Medium Risk
  if (MEDIUM_RISK_ACTION_TYPES.includes(normalizedAction)) {
    return {
      riskTier: 'MEDIUM_RISK',
      requiresClinicianApproval: false,
      requiresPatientConsent: true,
      canAutoExecute: false,
      reason: 'Scheduling and task coordination proposals require patient or caregiver confirmation.',
    };
  }

  // Default / Low Risk
  if (LOW_RISK_ACTION_TYPES.includes(normalizedAction) || normalizedAction.startsWith('GET_') || normalizedAction.startsWith('READ_')) {
    return {
      riskTier: 'LOW_RISK',
      requiresClinicianApproval: false,
      requiresPatientConsent: false,
      canAutoExecute: true,
      reason: 'Informational or read-only interactions can proceed autonomously.',
    };
  }

  // Unrecognized action types default to MEDIUM_RISK for safety
  return {
    riskTier: 'MEDIUM_RISK',
    requiresClinicianApproval: false,
    requiresPatientConsent: true,
    canAutoExecute: false,
    reason: 'Unclassified agent actions default to requiring user confirmation.',
  };
}

