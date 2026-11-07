/**
 * Centralized Clinical Terminology & Multi-Audience UI Language Layer
 * 
 * Supports three distinct audience perspectives:
 * 1. CLINICIAN: Clinically accurate terminology, LOINC/SNOMED context, precise units, lab details.
 * 2. PATIENT: Simple, plain-English, supportive, zero unnecessary jargon, actionable steps.
 * 3. CAREGIVER: Transparent, clear responsibilities, status tracking, safety alerts.
 */

export type UserAudience = 'CLINICIAN' | 'PATIENT' | 'CAREGIVER';

export interface TerminologyDefinition {
  code: string;
  clinicalName: string;
  patientFriendlyName: string;
  caregiverFriendlyName: string;
  simpleExplanation: string;
  cautionNotice?: string;
}

/**
 * Standard Diabetes Terminology with Multi-Audience Plain Language Explanations
 */
export const DIABETES_TERMINOLOGY: Record<string, TerminologyDefinition> = {
  HBA1C: {
    code: 'HBA1C',
    clinicalName: 'Hemoglobin A1c (Glycated Hemoglobin)',
    patientFriendlyName: '3-Month Average Blood Sugar',
    caregiverFriendlyName: '3-Month Blood Sugar Average',
    simpleExplanation: 'Shows your average blood sugar level over the past 2 to 3 months. Target for most adults with diabetes is under 7.0%.',
  },
  FASTING_GLUCOSE: {
    code: 'FASTING_GLUCOSE',
    clinicalName: 'Fasting Blood Glucose (FBS)',
    patientFriendlyName: 'Morning Fasting Sugar',
    caregiverFriendlyName: 'Morning Fasting Sugar',
    simpleExplanation: 'Your blood sugar measured first thing in the morning before eating or drinking anything except water.',
  },
  POST_MEAL_GLUCOSE: {
    code: 'POST_MEAL_GLUCOSE',
    clinicalName: 'Postprandial Blood Glucose (PPBS - 2 Hour)',
    patientFriendlyName: '2-Hour After-Meal Sugar',
    caregiverFriendlyName: 'After-Meal Sugar (2 Hours)',
    simpleExplanation: 'Your blood sugar measured exactly 2 hours after starting your meal. Helps check how meals affect your body.',
  },
  BEDTIME_GLUCOSE: {
    code: 'BEDTIME_GLUCOSE',
    clinicalName: 'Bedtime Blood Glucose',
    patientFriendlyName: 'Bedtime Sugar',
    caregiverFriendlyName: 'Bedtime Sugar',
    simpleExplanation: 'Blood sugar check before sleep to ensure levels stay safe overnight and avoid overnight drops.',
  },
  RANDOM_GLUCOSE: {
    code: 'RANDOM_GLUCOSE',
    clinicalName: 'Random Blood Glucose (RBS)',
    patientFriendlyName: 'Anytime Sugar Check',
    caregiverFriendlyName: 'Anytime Sugar Check',
    simpleExplanation: 'Blood sugar checked at any time of day, regardless of when you last ate.',
  },
  HYPOGLYCEMIA: {
    code: 'HYPOGLYCEMIA',
    clinicalName: 'Hypoglycemia (< 70 mg/dL)',
    patientFriendlyName: 'Low Blood Sugar Alert',
    caregiverFriendlyName: 'Low Blood Sugar Alert (Urgent)',
    simpleExplanation: 'Blood sugar has dropped below safe levels (under 70 mg/dL). You may feel shaky, sweaty, dizzy, or confused.',
    cautionNotice: 'Treat immediately with 15 grams of fast-acting sugar (half cup juice, 3-4 glucose tablets). Recheck in 15 minutes.',
  },
  HYPERGLYCEMIA: {
    code: 'HYPERGLYCEMIA',
    clinicalName: 'Hyperglycemia (> 180 mg/dL)',
    patientFriendlyName: 'High Blood Sugar Alert',
    caregiverFriendlyName: 'High Blood Sugar Alert',
    simpleExplanation: 'Blood sugar is higher than your doctor recommended target range.',
    cautionNotice: 'Drink water, take prescribed medicines as directed, and contact your doctor if symptoms persist.',
  },
  BLOOD_PRESSURE: {
    code: 'BLOOD_PRESSURE',
    clinicalName: 'Arterial Blood Pressure (Systolic / Diastolic)',
    patientFriendlyName: 'Blood Pressure',
    caregiverFriendlyName: 'Blood Pressure',
    simpleExplanation: 'Measures heart pumping strength (top number) and resting vessel pressure (bottom number). Target is usually below 130/80 mmHg.',
  },
  BODY_WEIGHT: {
    code: 'BODY_WEIGHT',
    clinicalName: 'Body Mass / Weight',
    patientFriendlyName: 'Weight',
    caregiverFriendlyName: 'Weight',
    simpleExplanation: 'Tracking weight helps monitor fluid balance, nutrition, and metabolic progress.',
  },
  MEDICATION_ADHERENCE: {
    code: 'MEDICATION_ADHERENCE',
    clinicalName: 'Pharmacotherapy Adherence Rate',
    patientFriendlyName: 'Daily Medicine Routine',
    caregiverFriendlyName: 'Medicine Schedule Status',
    simpleExplanation: 'How regularly prescribed medicines are taken according to your doctor directions.',
  },
  METFORMIN: {
    code: 'METFORMIN',
    clinicalName: 'Metformin Hydrochloride (Biguanide)',
    patientFriendlyName: 'Metformin (Blood Sugar Tablet)',
    caregiverFriendlyName: 'Metformin (Sugar Control)',
    simpleExplanation: 'A foundational medicine that helps your body use insulin better and lowers sugar produced by the liver. Always take with meals.',
  },
  INSULIN_BASAL: {
    code: 'INSULIN_BASAL',
    clinicalName: 'Long-Acting Basal Insulin',
    patientFriendlyName: 'Background Insulin (Long-Acting)',
    caregiverFriendlyName: 'Background Insulin',
    simpleExplanation: 'Provides a steady, continuous level of insulin throughout the entire day and night.',
  },
  INSULIN_BOLUS: {
    code: 'INSULIN_BOLUS',
    clinicalName: 'Rapid-Acting Prandial Insulin',
    patientFriendlyName: 'Mealtime Insulin (Fast-Acting)',
    caregiverFriendlyName: 'Mealtime Insulin',
    simpleExplanation: 'Taken shortly before eating to handle the rise in blood sugar from food.',
  },
};

/**
 * Context & Timing Labels across Audiences
 */
export const CONTEXT_LABELS: Record<string, Record<UserAudience, string>> = {
  FASTING: {
    CLINICIAN: 'Fasting (Overnight 8-12h)',
    PATIENT: 'Morning (Before Breakfast)',
    CAREGIVER: 'Morning (Before Breakfast)',
  },
  PRE_MEAL: {
    CLINICIAN: 'Preprandial (Pre-Meal)',
    PATIENT: 'Before Meal',
    CAREGIVER: 'Before Meal',
  },
  POST_MEAL_2HR: {
    CLINICIAN: 'Postprandial (2-Hour Post-Meal)',
    PATIENT: '2 Hours After Meal',
    CAREGIVER: '2 Hours After Meal',
  },
  BEDTIME: {
    CLINICIAN: 'Bedtime (Pre-Sleep)',
    PATIENT: 'Before Sleep',
    CAREGIVER: 'Before Sleep',
  },
  RANDOM: {
    CLINICIAN: 'Random / Unscheduled',
    PATIENT: 'Anytime Reading',
    CAREGIVER: 'Anytime Reading',
  },
  LAB_CONFIRMED: {
    CLINICIAN: 'Venous Laboratory Confirmed',
    PATIENT: 'Official Lab Test Result',
    CAREGIVER: 'Official Lab Test Result',
  },
};

/**
 * Actionable, Patient-Friendly Error Messages
 */
export const ACTIONABLE_ERRORS = {
  NETWORK_ERROR: 'Unable to connect to the AarogyaDamu service. Please check your internet connection and try again.',
  SESSION_EXPIRED: 'Your secure session has expired for your privacy. Please sign in again to continue.',
  INVALID_CREDENTIALS: 'The email or password entered does not match our records. Please verify and try again.',
  PERMISSION_DENIED: 'You do not have permission to view or edit this health record. Please check with the patient or clinic.',
  CAREGIVER_CONSENT_REQUIRED: 'This action requires active patient consent. The patient has not granted permission for this activity.',
  CAREGIVER_CONSENT_REVOKED: 'Access has been ended by the patient. If you need access, please ask the patient to share access again.',
  GLUCOSE_OUT_OF_RANGE: 'Please enter a valid glucose number between 20 mg/dL and 600 mg/dL. If you are experiencing an emergency, please use SOS.',
  EMPTY_REQUIRED_FIELD: 'Please complete all required fields before continuing.',
  AI_REQUIRES_DOCTOR_APPROVAL: 'This care suggestion was prepared by Damu AI and is waiting for your doctor review and signature before taking effect.',
  DOCUMENT_UPLOAD_FAILED: 'Could not upload the medical report. Please ensure the file is a PDF or clear image under 10 MB.',
  OCR_UNVERIFIED_NOTICE: 'This document was read automatically and must be verified by a clinician or patient before being treated as official clinical history.',
};

/**
 * Empty States with Clear, Encouraging Guidance
 */
export const EMPTY_STATES = {
  NO_OBSERVATIONS: {
    title: 'No Health Readings Yet',
    description: 'Log your first blood sugar reading above to start tracking your health journey.',
    actionText: 'Record Sugar Reading',
  },
  NO_CARE_PLAN: {
    title: 'Care Plan In Preparation',
    description: 'Your doctor will assign your personalized diabetes care plan and goals at your next visit.',
    actionText: 'Schedule Visit',
  },
  NO_PENDING_TASKS: {
    title: 'All Caught Up!',
    description: 'You have completed all scheduled health activities for today. Great job keeping your routine!',
    actionText: 'View Past Tasks',
  },
  NO_CAREGIVER_TASKS: {
    title: 'No Delegated Tasks Right Now',
    description: 'There are currently no care activities delegated to you by the patient or doctor.',
    actionText: 'Refresh List',
  },
  NO_APPOINTMENTS: {
    title: 'No Upcoming Appointments',
    description: 'Book your next consultation with your diabetologist to review your glycemic progress.',
    actionText: 'Book Appointment',
  },
  NO_MEDICATIONS: {
    title: 'No Active Prescriptions',
    description: 'Prescribed medicines from your doctor will appear here with timing schedules and reminders.',
    actionText: 'Contact Doctor',
  },
};

/**
 * Returns plain-language medical explanation based on user role
 */
export function explainMedicalTerm(termKey: string, audience: UserAudience = 'PATIENT'): string {
  const term = DIABETES_TERMINOLOGY[termKey];
  if (!term) return termKey;

  if (audience === 'CLINICIAN') {
    return `${term.clinicalName} (${term.code})`;
  }
  return `${term.patientFriendlyName} — ${term.simpleExplanation}`;
}

/**
 * Returns audience-appropriate context label
 */
export function getContextLabel(context: string, audience: UserAudience = 'PATIENT'): string {
  const mapping = CONTEXT_LABELS[context];
  if (!mapping) return context.replace(/_/g, ' ');
  return mapping[audience] || mapping.PATIENT;
}

/**
 * Format glucose reading with audience-appropriate interpretation
 */
export function formatGlucoseReading(
  value: number,
  context: string,
  audience: UserAudience = 'PATIENT'
): { formatted: string; status: 'NORMAL' | 'LOW' | 'HIGH'; label: string; guidance?: string } {
  const unit = 'mg/dL';
  const isFasting = context === 'FASTING' || context === 'PRE_MEAL';
  
  // Clinical cutoffs (ADA 2026 Guidelines)
  const isLow = value < 70;
  const isHigh = isFasting ? value > 130 : value > 180;

  if (isLow) {
    return {
      formatted: `${value} ${unit}`,
      status: 'LOW',
      label: audience === 'CLINICIAN' ? 'Hypoglycemia (<70 mg/dL)' : 'Low Sugar Alert',
      guidance: audience === 'CLINICIAN' 
        ? 'Evaluate for medication excess or skipped meal. Follow rule of 15.'
        : 'Take 15g fast sugar (half cup fruit juice or glucose tablets). Rest and retest in 15 minutes.',
    };
  }

  if (isHigh) {
    return {
      formatted: `${value} ${unit}`,
      status: 'HIGH',
      label: audience === 'CLINICIAN' ? `Elevated Glycemia (Target: ${isFasting ? '<130' : '<180'} mg/dL)` : 'Above Target Range',
      guidance: audience === 'CLINICIAN'
        ? 'Review recent diet, adherence, and medication dosage.'
        : 'Drink water, take scheduled medicines, and monitor for persistent high readings.',
    };
  }

  return {
    formatted: `${value} ${unit}`,
    status: 'NORMAL',
    label: audience === 'CLINICIAN' ? 'In Glycemic Target' : 'In Target Range',
    guidance: 'Great reading! Keep up your healthy routine.',
  };
}

