/**
 * Damu NLU Intent Classifier & Clinical Safety Guard
 * Implements deterministic emergency escalation, clinical action refusal, and 12+ intent classifications.
 */

export type DamuIntent =
  | 'EMERGENCY_ESCALATION'
  | 'PROHIBITED_ACTION_REFUSAL'
  | 'JOURNEY_PROGRESS'
  | 'DOCTOR_DISCUSSION_POINTS'
  | 'REMINDER_EXPLANATION'
  | 'GLUCOSE_SUMMARY'
  | 'GLUCOSE_COMPARISON'
  | 'MEDICATION_SCHEDULE'
  | 'MEDICATION_ADHERENCE'
  | 'CARE_PLAN_TARGETS'
  | 'TASKS_AND_REMINDERS'
  | 'APPOINTMENTS_SCHEDULE'
  | 'CONSULTATION_SUMMARY'
  | 'MEDICAL_REPORTS_SUMMARY'
  | 'MEDICAL_REPORT_EXPLAIN'
  | 'DIABETES_EDUCATION'
  | 'LIFESTYLE_GUIDANCE'
  | 'GREETING'
  | 'GENERAL_HEALTH_QUERY';

export interface DamuNluAnalysis {
  intent: DamuIntent;
  hasEmergency: boolean;
  emergencyNotice?: string;
  isProhibited: boolean;
  refusalReason?: string;
  educationalTopic?: string;
  requiresKnowledgeSearch: boolean;
  confidence: number;
}

/**
 * Deterministic Emergency Precedence Check.
 * Escalate immediately to national emergency services (112 in India).
 */
export function checkEmergencyPrecedence(
  text: string,
  recentGlucose?: number | null
): { hasEmergency: boolean; notice?: string } {
  const lower = text.toLowerCase();

  // 1. Extreme Metabolic Conditions
  if (recentGlucose !== null && recentGlucose !== undefined) {
    if (recentGlucose < 54) {
      return {
        hasEmergency: true,
        notice: `CRITICAL ALERT: Blood glucose is severely low (${recentGlucose} mg/dL). Severe hypoglycemia can cause seizures or loss of consciousness. Call 112 or 108 (India emergency/ambulance services) immediately. If conscious, consume fast-acting glucose; do not give oral items if drowsy or unconscious.`,
      };
    }
    if (recentGlucose > 300) {
      return {
        hasEmergency: true,
        notice: `URGENT WARNING: Blood glucose is critically elevated (${recentGlucose} mg/dL). High risk of Diabetic Ketoacidosis (DKA) or Hyperosmolar Hyperglycemic State (HHS). Seek urgent emergency medical evaluation or contact your diabetes care team immediately.`,
      };
    }
  }

  // 2. Acute Red-Flag Emergency Keywords
  const emergencyKeywords = [
    'chest pain',
    'cannot breathe',
    'difficulty breathing',
    'shortness of breath',
    'loss of consciousness',
    'unconscious',
    'passed out',
    'fainted',
    'seizure',
    'convulsion',
    'slurred speech',
    'face drooping',
    'stroke',
    'heart attack',
    'severe abdominal pain and vomiting',
    'ketoacidosis',
  ];

  for (const kw of emergencyKeywords) {
    if (lower.includes(kw)) {
      return {
        hasEmergency: true,
        notice: `EMERGENCY ALERT: Potential life-threatening acute symptom detected ('${kw}'). AarogyaDamu is an AI health intelligence companion and cannot provide emergency medical care. Please call 112 or 108 (India emergency/ambulance services) or visit the nearest emergency medical facility immediately.`,
      };
    }
  }

  return { hasEmergency: false };
}

/**
 * Prohibited Clinical Action Refusal Check.
 * Damu is an assistive companion, not a licensed clinician. It must decline prescribing, dose modifications, or diagnosing.
 */
export function checkProhibitedClinicalActions(text: string): {
  isProhibited: boolean;
  refusalReason?: string;
} {
  const lower = text.toLowerCase();

  // 1. Prescriptions
  if (
    lower.includes('prescribe') ||
    lower.includes('prescription') ||
    lower.includes('order me insulin') ||
    lower.includes('script for')
  ) {
    return {
      isProhibited: true,
      refusalReason:
        'I am not licensed to prescribe medications. Prescriptions must be issued by a registered medical practitioner. Please consult your doctor for any new medication.',
    };
  }

  // 2. Dose Adjustments & Titration
  if (
    /\b(?:adjust|change|increase|decrease|raise|lower)\s+(?:my\s+)?(?:insulin|medication|medicine|dose|dosage|units?)(?:\s+(?:dose|dosage|units?))?\b/i.test(
      lower
    ) ||
    lower.includes('adjust my insulin') ||
    lower.includes('increase my insulin') ||
    lower.includes('decrease my insulin') ||
    lower.includes('how many units should i take') ||
    lower.includes('change my dose') ||
    lower.includes('double my metformin') ||
    lower.includes('halve my dose') ||
    lower.includes('stop taking my medication') ||
    lower.includes('insulin titration')
  ) {
    return {
      isProhibited: true,
      refusalReason:
        'I cannot alter or recommend changes to your medication dosages or insulin units. Dosage adjustments must be determined strictly by your prescribing physician. Please contact your doctor or schedule a review.',
    };
  }

  // 3. Independent Medical Diagnosis
  if (
    lower.includes('diagnose me') ||
    lower.includes('do i have diabetes') ||
    lower.includes('what disease do i have') ||
    lower.includes('diagnose my symptoms') ||
    lower.includes('do i have cancer')
  ) {
    return {
      isProhibited: true,
      refusalReason:
        'I cannot provide a formal medical diagnosis. Diagnosing medical conditions requires clinical examination and laboratory evaluation by a licensed physician. Please consult your doctor.',
    };
  }

  return { isProhibited: false };
}

/**
 * Classifies patient intent across 12+ distinct categories.
 */
export function classifyDamuIntent(
  text: string,
  recentGlucose?: number | null
): DamuNluAnalysis {
  const query = text.trim();
  const lower = query.toLowerCase();

  // 1. Emergency Precedence
  const emergency = checkEmergencyPrecedence(query, recentGlucose);
  if (emergency.hasEmergency) {
    return {
      intent: 'EMERGENCY_ESCALATION',
      hasEmergency: true,
      emergencyNotice: emergency.notice,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 1.0,
    };
  }

  // 2. Prohibited Actions
  const prohibited = checkProhibitedClinicalActions(query);
  if (prohibited.isProhibited) {
    return {
      intent: 'PROHIBITED_ACTION_REFUSAL',
      hasEmergency: false,
      isProhibited: true,
      refusalReason: prohibited.refusalReason,
      requiresKnowledgeSearch: false,
      confidence: 1.0,
    };
  }

  // 3. Greeting / Persona
  if (
    /^(hi|hello|hey|namaste|vanakkam|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+can\s+you\s+do)/i.test(
      query
    )
  ) {
    return {
      intent: 'GREETING',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.95,
    };
  }

  // 3.1 Phase 7: Doctor Discussion Points
  if (
    lower.includes('discuss with my doctor') ||
    lower.includes('discuss with doctor') ||
    lower.includes('what should i discuss') ||
    lower.includes('prepare for my doctor') ||
    lower.includes('prepare for my visit') ||
    lower.includes('questions for my doctor') ||
    lower.includes('consultation prep') ||
    lower.includes('talk to my doctor')
  ) {
    return {
      intent: 'DOCTOR_DISCUSSION_POINTS',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.95,
    };
  }

  // 3.2 Phase 7: Reminder Explanation
  if (
    lower.includes('why am i receiving this reminder') ||
    lower.includes('why did i get this reminder') ||
    lower.includes('why this reminder') ||
    lower.includes('explain this reminder') ||
    lower.includes('why am i getting this notification') ||
    lower.includes('why this notification')
  ) {
    return {
      intent: 'REMINDER_EXPLANATION',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.95,
    };
  }

  // 3.3 Phase 7: Care Journey Progress & Weekly Completions
  if (
    lower.includes('journey') ||
    lower.includes('milestone') ||
    lower.includes('badge') ||
    lower.includes('progress this month') ||
    lower.includes('how has my diabetes journey progressed') ||
    lower.includes('how am i doing overall') ||
    lower.includes('what have i completed this week') ||
    lower.includes('what have i completed') ||
    lower.includes('what is my progress') ||
    lower.includes('care progress')
  ) {
    return {
      intent: 'JOURNEY_PROGRESS',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.92,
    };
  }

  // 4. Lifestyle guidance
  if (
    lower.includes('what should i eat') ||
    lower.includes('what to eat') ||
    lower.includes('diet') ||
    lower.includes('food') ||
    lower.includes('meal') ||
    lower.includes('dinner') ||
    lower.includes('lunch') ||
    lower.includes('breakfast') ||
    lower.includes('plate method') ||
    lower.includes('nutrition') ||
    lower.includes('rice') ||
    lower.includes('roti')
  ) {
    return {
      intent: 'LIFESTYLE_GUIDANCE',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: true,
      educationalTopic: query,
      confidence: 0.9,
    };
  }

  // 5. Diabetes Education & Self-Care Concepts (Rule of 15, exercise)
  if (
    lower.includes('rule of 15') ||
    lower.includes('plate method') ||
    lower.includes('diet') ||
    lower.includes('food') ||
    lower.includes('what to eat') ||
    lower.includes('what should i eat') ||
    lower.includes('rice') ||
    lower.includes('exercise') ||
    lower.includes('walking') ||
    lower.includes('workout') ||
    lower.includes('what is diabetes') ||
    lower.includes('what is hba1c') ||
    lower.includes('explain hba1c') ||
    lower.includes('low sugar treatment')
  ) {
    return {
      intent: 'DIABETES_EDUCATION',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: true,
      educationalTopic: query,
      confidence: 0.9,
    };
  }

  // 6. Glucose Comparison (last 7 days vs prior 7 days / trends)
  if (
    lower.includes('compare') ||
    (lower.includes('trend') && (lower.includes('week') || lower.includes('sugar') || lower.includes('glucose'))) ||
    lower.includes('this week vs last week') ||
    lower.includes('how does my sugar compare') ||
    lower.includes('better or worse')
  ) {
    return {
      intent: 'GLUCOSE_COMPARISON',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 7. Glucose Summary (overall, average, TIR, high, low)
  if (
    lower.includes('sugar') ||
    lower.includes('glucose') ||
    lower.includes('blood sugar') ||
    lower.includes('time in range') ||
    lower.includes('fasting average') ||
    lower.includes('average sugar')
  ) {
    return {
      intent: 'GLUCOSE_SUMMARY',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 8. Medication Adherence
  if (
    lower.includes('adherence') ||
    lower.includes('did i take') ||
    lower.includes('have i taken') ||
    lower.includes('missed doses') ||
    lower.includes('skipped doses') ||
    lower.includes('taken my medicine')
  ) {
    return {
      intent: 'MEDICATION_ADHERENCE',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 9. Medication Schedule / Prescriptions
  if (
    lower.includes('medicine') ||
    lower.includes('medication') ||
    lower.includes('prescriptions') ||
    lower.includes('tablet') ||
    lower.includes('pill') ||
    lower.includes('med vault') ||
    lower.includes('what medicines')
  ) {
    return {
      intent: 'MEDICATION_SCHEDULE',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 10. Care Plan & Targets
  if (
    lower.includes('care plan') ||
    lower.includes('target') ||
    lower.includes('goals') ||
    lower.includes('hba1c target') ||
    lower.includes('doctor plan')
  ) {
    return {
      intent: 'CARE_PLAN_TARGETS',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: true,
      educationalTopic: 'glucose targets and care plans',
      confidence: 0.85,
    };
  }

  // 11. Tasks & Reminders
  if (
    lower.includes('task') ||
    lower.includes('reminder') ||
    lower.includes('to do') ||
    lower.includes('what should i do today') ||
    lower.includes('pending')
  ) {
    return {
      intent: 'TASKS_AND_REMINDERS',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 12. Appointments
  if (
    lower.includes('appointment') ||
    lower.includes('doctor visit') ||
    lower.includes('clinic visit') ||
    lower.includes('when is my checkup') ||
    lower.includes('see doctor')
  ) {
    return {
      intent: 'APPOINTMENTS_SCHEDULE',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 13. Consultation Summary (Visit Notes)
  if (
    lower.includes('consultation') ||
    lower.includes('doctor note') ||
    lower.includes('visit note') ||
    lower.includes('what did the doctor say') ||
    lower.includes('summary of my visit') ||
    lower.includes('doctor advised')
  ) {
    return {
      intent: 'CONSULTATION_SUMMARY',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.9,
    };
  }

  // 14. Medical Reports / Lab Reports
  if (
    lower.includes('explain my report') ||
    lower.includes('explain this report') ||
    lower.includes('what does my report mean') ||
    lower.includes('what do my lab results mean') ||
    lower.includes('help me understand my report') ||
    lower.includes('interpret my report')
  ) {
    return {
      intent: 'MEDICAL_REPORT_EXPLAIN',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.95,
    };
  }

  if (
    lower.includes('report') ||
    lower.includes('lab') ||
    lower.includes('blood test') ||
    lower.includes('test result') ||
    lower.includes('document')
  ) {
    return {
      intent: 'MEDICAL_REPORTS_SUMMARY',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: false,
      confidence: 0.85,
    };
  }

  // 15. Diabetes Education (Exercise, hypo rule of 15, hyper signs, HbA1c)
  if (
    lower.includes('diet') ||
    lower.includes('food') ||
    lower.includes('plate method') ||
    lower.includes('what to eat') ||
    lower.includes('rice') ||
    lower.includes('exercise') ||
    lower.includes('walk') ||
    lower.includes('steps') ||
    lower.includes('sleep') ||
    lower.includes('stress') ||
    lower.includes('rule of 15') ||
    lower.includes('low sugar treatment') ||
    lower.includes('hba1c') ||
    lower.includes('what is diabetes') ||
    lower.includes('hypo') ||
    lower.includes('hyper')
  ) {
    return {
      intent: 'DIABETES_EDUCATION',
      hasEmergency: false,
      isProhibited: false,
      requiresKnowledgeSearch: true,
      educationalTopic: query,
      confidence: 0.9,
    };
  }

  // Default Fallback
  return {
    intent: 'GENERAL_HEALTH_QUERY',
    hasEmergency: false,
    isProhibited: false,
    requiresKnowledgeSearch: true,
    educationalTopic: query,
    confidence: 0.7,
  };
}
