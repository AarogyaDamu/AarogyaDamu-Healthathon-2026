import {
  evaluateEmergencyPrecedence,
  createProhibitedRefusal,
  AgentEmergencyEvaluation,
  AgentProhibitedRefusal,
  AgentToolName,
  ProhibitedClinicalActionCategory,
} from '@aarogyadamu/contracts';

export interface CandidateActionProposal {
  toolName: AgentToolName;
  parameters: Record<string, unknown>;
  summary: string;
}

export interface IntentClassificationResult {
  hasEmergency: boolean;
  emergencyEvaluation?: AgentEmergencyEvaluation;
  isProhibited: boolean;
  prohibitedRefusal?: AgentProhibitedRefusal;
  userIntent: string;
  explanation: string;
  candidateActions: CandidateActionProposal[];
}

/**
 * Evaluates whether a text query contains prohibited clinical requests.
 */
export function detectProhibitedClinicalIntent(query: string): {
  isProhibited: boolean;
  category?: ProhibitedClinicalActionCategory;
} {
  const lower = query.toLowerCase();

  // 1. Prescribe medication
  if (
    lower.includes('prescribe') ||
    lower.includes('write me a prescription') ||
    lower.includes('start me on insulin') ||
    lower.includes('give me a script for')
  ) {
    return { isProhibited: true, category: 'PRESCRIBE_MEDICATION' };
  }

  // 2. Adjust insulin units
  if (
    lower.includes('adjust my insulin') ||
    lower.includes('increase my insulin') ||
    lower.includes('decrease my insulin') ||
    lower.includes('change insulin units') ||
    lower.includes('how many units of insulin should i take') ||
    lower.includes('insulin titration')
  ) {
    return { isProhibited: true, category: 'ADJUST_INSULIN_DOSE' };
  }

  // 3. Modify medication dose
  if (
    lower.includes('double my metformin') ||
    lower.includes('halve my dose') ||
    lower.includes('stop taking my medication') ||
    lower.includes('change my dosage to')
  ) {
    return { isProhibited: true, category: 'MODIFY_MEDICATION_DOSE' };
  }

  // 4. Independent diagnosis
  if (
    lower.includes('do i have diabetes') ||
    lower.includes('diagnose me') ||
    lower.includes('what disease do i have') ||
    lower.includes('diagnose my symptoms')
  ) {
    return { isProhibited: true, category: 'INDEPENDENT_DIAGNOSIS' };
  }

  // 5. Change clinical target range without doctor
  if (
    lower.includes('change my target range without doctor') ||
    lower.includes('override clinical targets') ||
    lower.includes('lower my target fasting range without physician')
  ) {
    return { isProhibited: true, category: 'CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR' };
  }

  // 6. Delete observation history
  if (
    lower.includes('delete my glucose logs') ||
    lower.includes('delete observation history') ||
    lower.includes('erase my high blood sugar readings')
  ) {
    return { isProhibited: true, category: 'DELETE_OBSERVATION_HISTORY' };
  }

  // 7. Bypass caregiver consent
  if (
    lower.includes('bypass caregiver consent') ||
    lower.includes('access patient data without consent')
  ) {
    return { isProhibited: true, category: 'BYPASS_CAREGIVER_CONSENT' };
  }

  return { isProhibited: false };
}

/**
 * Classifies user intent, checks emergency precedence, detects prohibited clinical actions,
 * and formulates candidate tool proposals.
 */
export function classifyAgentIntent(params: {
  userQuery: string;
  detectedGlucose?: number | null;
  emergencyNotice?: string | null;
  defaultDoctorId?: string;
}): IntentClassificationResult {
  const { userQuery, detectedGlucose, emergencyNotice, defaultDoctorId } = params;

  // 1. Emergency precedence check
  const emergencyEval = evaluateEmergencyPrecedence(emergencyNotice, detectedGlucose);
  if (emergencyEval.hasEmergency) {
    return {
      hasEmergency: true,
      emergencyEvaluation: emergencyEval,
      isProhibited: false,
      userIntent: 'EMERGENCY_HALT',
      explanation: emergencyEval.haltReason || 'Emergency condition detected. Agent planning halted.',
      candidateActions: [],
    };
  }

  // Also check query for acute red-flag emergency symptoms
  const lower = userQuery.toLowerCase();
  const emergencyKeywords = ['chest pain', 'unconscious', 'fainted', 'seizure', 'cannot breathe', 'choking'];
  for (const kw of emergencyKeywords) {
    if (lower.includes(kw)) {
      const em = evaluateEmergencyPrecedence(`Critical symptom '${kw}' mentioned in query. Immediate emergency intervention required.`);
      return {
        hasEmergency: true,
        emergencyEvaluation: em,
        isProhibited: false,
        userIntent: 'EMERGENCY_HALT',
        explanation: `Emergency condition detected (${kw}). Execution halted immediately.`,
        candidateActions: [],
      };
    }
  }

  // 2. Prohibited clinical intent check
  const prohibitedCheck = detectProhibitedClinicalIntent(userQuery);
  if (prohibitedCheck.isProhibited && prohibitedCheck.category) {
    const refusal = createProhibitedRefusal(prohibitedCheck.category);
    return {
      hasEmergency: false,
      isProhibited: true,
      prohibitedRefusal: refusal,
      userIntent: 'PROHIBITED_ACTION_REFUSAL',
      explanation: refusal.refusalReason,
      candidateActions: [],
    };
  }

  // 3. Allowed intent classification & tool mapping
  const candidateActions: CandidateActionProposal[] = [];
  let userIntent = 'GENERAL_HEALTH_SUPPORT';
  let explanation = 'Generated plan to support diabetes self-care and follow-up activities.';

  // Scenario A: Glucose check or task scheduling
  if (lower.includes('remind') && (lower.includes('metformin') || lower.includes('medicine') || lower.includes('tablet') || lower.includes('pill'))) {
    userIntent = 'SCHEDULE_MEDICATION_REMINDER';
    explanation = 'Plan to schedule daily medication reminders.';
    candidateActions.push({
      toolName: 'tool_schedule_reminder',
      parameters: {
        title: 'Daily Medication Reminder',
        category: 'MEDICATION',
        remindAt: new Date(Date.now() + 3600000).toISOString(),
        recurrence: 'DAILY',
        notes: 'Take with meal as prescribed',
      },
      summary: 'Schedule daily medication reminder',
    });
  } else if (lower.includes('sugar') || lower.includes('glucose') || lower.includes('fasting check')) {
    if (lower.includes('summary') || lower.includes('how was') || lower.includes('trend') || lower.includes('average')) {
      userIntent = 'QUERY_HEALTH_METRICS';
      explanation = 'Plan to retrieve recent blood glucose history and summary.';
      candidateActions.push({
        toolName: 'tool_query_health_summary',
        parameters: {
          metric: 'BLOOD_GLUCOSE',
          timeRangeDays: 14,
        },
        summary: 'Query 14-day blood glucose ambulatory summary',
      });
    } else {
      userIntent = 'SCHEDULE_CARE_TASK';
      explanation = 'Plan to schedule fasting blood glucose check.';
      candidateActions.push({
        toolName: 'tool_schedule_care_task',
        parameters: {
          title: 'Morning Fasting Blood Glucose Check',
          category: 'GLUCOSE_CHECK',
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          notes: 'Log fasting sugar level before breakfast',
        },
        summary: 'Schedule tomorrow morning fasting glucose check',
      });
    }
  }

  // Scenario B: Request Doctor Appointment
  if (lower.includes('appointment') || lower.includes('see doctor') || lower.includes('consultation') || lower.includes('visit doctor')) {
    userIntent = 'REQUEST_DOCTOR_APPOINTMENT';
    explanation = 'Plan to request a clinic checkup with the treating physician.';
    candidateActions.push({
      toolName: 'tool_request_appointment',
      parameters: {
        doctorId: defaultDoctorId || '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
        durationMinutes: 30,
        reason: 'Diabetic routine checkup and care plan review',
        visitType: 'CHECKUP',
      },
      summary: 'Request consultation appointment with assigned clinician',
    });
  }

  // Scenario C: Lifestyle Logging (walk, exercise, sleep, water)
  if (lower.includes('walk') || lower.includes('exercise') || lower.includes('workout') || lower.includes('steps')) {
    userIntent = 'LOG_LIFESTYLE_RECORD';
    explanation = 'Plan to record physical activity in lifestyle twin.';
    candidateActions.push({
      toolName: 'tool_log_lifestyle_record',
      parameters: {
        category: 'PHYSICAL_ACTIVITY',
        numericValue: 30,
        unit: 'MINUTES',
        qualitativeValue: 'MODERATE_WALK',
        notes: '30-minute brisk walk in evening',
      },
      summary: 'Log 30 minutes of moderate physical activity',
    });
  }

  // Scenario D: Care Proposal (Medication adjustment request / doctor proposal)
  if (lower.includes('nausea') || lower.includes('stomach upset') || lower.includes('side effect') || lower.includes('propose to doctor')) {
    userIntent = 'DRAFT_CARE_PROPOSAL';
    explanation = 'Plan to draft a clinical care proposal for treating clinician review.';
    candidateActions.push({
      toolName: 'tool_draft_care_proposal',
      parameters: {
        proposalType: 'MEDICATION_ADJUSTMENT_REQUEST',
        title: 'Review medication tolerance due to reported gastrointestinal symptoms',
        rationale: 'Patient reported persistent nausea and gastrointestinal discomfort after medication intake.',
        proposedDetails: {
          symptomDescription: 'Nausea and stomach upset',
          suggestion: 'Clinician evaluation of medication formulation or timing',
        },
      },
      summary: 'Draft care proposal for doctor to review medication tolerance',
    });
  }

  // Default fallback if no specific pattern matched
  if (candidateActions.length === 0) {
    userIntent = 'GENERAL_HEALTH_QUERY';
    explanation = 'Plan to query health summary metrics.';
    candidateActions.push({
      toolName: 'tool_query_health_summary',
      parameters: {
        metric: 'ALL',
        timeRangeDays: 7,
      },
      summary: 'Query general 7-day health observation summary',
    });
  }

  return {
    hasEmergency: false,
    isProhibited: false,
    userIntent,
    explanation,
    candidateActions,
  };
}

