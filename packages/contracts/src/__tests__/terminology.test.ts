/**
 * Automated Test Suite for Centralized Terminology & Language Simplification
 * Verifies plain-English medical explanations for patients/caregivers,
 * clinical accuracy preservation for clinicians, context labels, and actionable errors.
 */

import {
  DIABETES_TERMINOLOGY,
  CONTEXT_LABELS,
  ACTIONABLE_ERRORS,
  EMPTY_STATES,
  explainMedicalTerm,
  getContextLabel,
  formatGlucoseReading,
} from '../terminology';

describe('Centralized Terminology & Multi-Audience Language Layer', () => {
  describe('1. Medical Jargon Simplification for Patients & Caregivers', () => {
    it('translates HbA1c to 3-Month Average Blood Sugar for patients', () => {
      const patientExplanation = explainMedicalTerm('HBA1C', 'PATIENT');
      expect(patientExplanation).toContain('3-Month Average Blood Sugar');
      expect(patientExplanation).toContain('average blood sugar level over the past 2 to 3 months');

      const caregiverExplanation = explainMedicalTerm('HBA1C', 'CAREGIVER');
      expect(caregiverExplanation).toContain('3-Month Blood Sugar Average');

      const doctorExplanation = explainMedicalTerm('HBA1C', 'CLINICIAN');
      expect(doctorExplanation).toContain('Hemoglobin A1c');
    });

    it('translates fasting and post-meal glucose to simple terminology', () => {
      expect(explainMedicalTerm('FASTING_GLUCOSE', 'PATIENT')).toContain('Morning Fasting Sugar');
      expect(explainMedicalTerm('POST_MEAL_GLUCOSE', 'PATIENT')).toContain('2-Hour After-Meal Sugar');
      expect(explainMedicalTerm('BEDTIME_GLUCOSE', 'PATIENT')).toContain('Bedtime Sugar');
    });

    it('provides urgent, actionable guidance for hypoglycemia', () => {
      const hypo = DIABETES_TERMINOLOGY.HYPOGLYCEMIA;
      expect(hypo.patientFriendlyName).toBe('Low Blood Sugar Alert');
      expect(hypo.cautionNotice).toContain('Treat immediately with 15 grams of fast-acting sugar');
    });

    it('explains Metformin in simple terms without confusing biguanide jargon', () => {
      const met = DIABETES_TERMINOLOGY.METFORMIN;
      expect(met.patientFriendlyName).toContain('Metformin (Blood Sugar Tablet)');
      expect(met.simpleExplanation).toContain('Always take with meals');
    });
  });

  describe('2. Multi-Audience Context & Timing Labels', () => {
    it('returns appropriate context labels based on audience', () => {
      expect(getContextLabel('FASTING', 'CLINICIAN')).toBe('Fasting (Overnight 8-12h)');
      expect(getContextLabel('FASTING', 'PATIENT')).toBe('Morning (Before Breakfast)');
      expect(getContextLabel('FASTING', 'CAREGIVER')).toBe('Morning (Before Breakfast)');

      expect(getContextLabel('POST_MEAL_2HR', 'CLINICIAN')).toBe('Postprandial (2-Hour Post-Meal)');
      expect(getContextLabel('POST_MEAL_2HR', 'PATIENT')).toBe('2 Hours After Meal');
    });
  });

  describe('3. Actionable & Empathetic Error Messages', () => {
    it('provides clear, actionable error text without stack traces or cryptic codes', () => {
      expect(ACTIONABLE_ERRORS.NETWORK_ERROR).toContain('check your internet connection');
      expect(ACTIONABLE_ERRORS.SESSION_EXPIRED).toContain('sign in again to continue');
      expect(ACTIONABLE_ERRORS.CAREGIVER_CONSENT_REQUIRED).toContain('requires active patient consent');
      expect(ACTIONABLE_ERRORS.GLUCOSE_OUT_OF_RANGE).toContain('between 20 mg/dL and 600 mg/dL');
      expect(ACTIONABLE_ERRORS.AI_REQUIRES_DOCTOR_APPROVAL).toContain('doctor review and signature');
    });
  });

  describe('4. Empathetic Empty States with Actionable Guidance', () => {
    it('defines clear empty states with next-step guidance', () => {
      expect(EMPTY_STATES.NO_OBSERVATIONS.actionText).toBe('Record Sugar Reading');
      expect(EMPTY_STATES.NO_PENDING_TASKS.title).toBe('All Caught Up!');
      expect(EMPTY_STATES.NO_CAREGIVER_TASKS.description).toContain('no care activities delegated');
    });
  });

  describe('5. Intelligent Glucose Interpretation & Safety Bounding', () => {
    it('identifies hypoglycemia (<70 mg/dL) with rule-of-15 guidance', () => {
      const reading = formatGlucoseReading(62, 'FASTING', 'PATIENT');
      expect(reading.status).toBe('LOW');
      expect(reading.label).toBe('Low Sugar Alert');
      expect(reading.guidance).toContain('15g fast sugar');
    });

    it('identifies elevated fasting glucose (>130 mg/dL)', () => {
      const reading = formatGlucoseReading(154, 'FASTING', 'PATIENT');
      expect(reading.status).toBe('HIGH');
      expect(reading.label).toBe('Above Target Range');
      expect(reading.guidance).toContain('Drink water');
    });

    it('identifies in-target glucose (80-130 mg/dL)', () => {
      const reading = formatGlucoseReading(118, 'FASTING', 'PATIENT');
      expect(reading.status).toBe('NORMAL');
      expect(reading.label).toBe('In Target Range');
    });
  });
});

