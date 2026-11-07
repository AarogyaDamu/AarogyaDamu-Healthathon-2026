/**
 * Integrated Terminology & LOINC Suite for AarogyaDamu
 */

import {
  DIABETES_TERMINOLOGY,
  CONTEXT_LABELS,
  ACTIONABLE_ERRORS,
  EMPTY_STATES,
  explainMedicalTerm,
  getContextLabel,
  formatGlucoseReading,
  LOINC_CODES,
  resolveLoincCoding,
  toCanonicalUcum,
} from '@aarogyadamu/contracts';

describe('AarogyaDamu Terminology & LOINC Integration Suite', () => {
  describe('Terminology & Language Layer', () => {
    it('provides patient-accessible translation for HbA1c', () => {
      const patientLabel = explainMedicalTerm('HBA1C', 'PATIENT');
      expect(patientLabel).toContain('3-Month Average Blood Sugar');

      const docLabel = explainMedicalTerm('HBA1C', 'CLINICIAN');
      expect(docLabel).toContain('Hemoglobin A1c');
    });

    it('translates fasting and post-meal glucose contexts across audiences', () => {
      expect(getContextLabel('FASTING', 'CLINICIAN')).toBe('Fasting (Overnight 8-12h)');
      expect(getContextLabel('FASTING', 'PATIENT')).toBe('Morning (Before Breakfast)');
      expect(getContextLabel('POST_MEAL_2HR', 'PATIENT')).toBe('2 Hours After Meal');
    });

    it('provides clear actionable error messages', () => {
      expect(ACTIONABLE_ERRORS.SESSION_EXPIRED).toContain('sign in again');
      expect(ACTIONABLE_ERRORS.CAREGIVER_CONSENT_REQUIRED).toContain('active patient consent');
      expect(ACTIONABLE_ERRORS.AI_REQUIRES_DOCTOR_APPROVAL).toContain('doctor review');
    });

    it('formats glucose with clinical targets and emergency guidance', () => {
      const normal = formatGlucoseReading(110, 'FASTING', 'PATIENT');
      expect(normal.status).toBe('NORMAL');

      const hypo = formatGlucoseReading(58, 'FASTING', 'PATIENT');
      expect(hypo.status).toBe('LOW');
      expect(hypo.guidance).toContain('15g fast sugar');
    });
  });

  describe('LOINC & UCUM Terminology', () => {
    it('maps glucose by specimen and timing context', () => {
      const pocFasting = resolveLoincCoding({ type: 'BLOOD_GLUCOSE', context: 'FASTING', provenance: 'PATIENT_ENTERED' });
      expect(pocFasting?.code).toBe(LOINC_CODES.GLUCOSE_BLOOD_GLUCOMETER.code);

      const labFasting = resolveLoincCoding({ type: 'BLOOD_GLUCOSE', context: 'FASTING', provenance: 'LAB_CONFIRMED' });
      expect(labFasting?.code).toBe(LOINC_CODES.GLUCOSE_FASTING_SERUM.code);

      const postMeal = resolveLoincCoding({ type: 'BLOOD_GLUCOSE', context: 'POST_MEAL_2HR' });
      expect(postMeal?.code).toBe(LOINC_CODES.GLUCOSE_POST_MEAL_2HR.code);

      const hba1c = resolveLoincCoding({ type: 'HBA1C' });
      expect(hba1c?.code).toBe(LOINC_CODES.HBA1C_BLOOD.code);
    });

    it('canonicalizes UCUM units correctly', () => {
      expect(toCanonicalUcum('mmHg')).toBe('mm[Hg]');
      expect(toCanonicalUcum('mg/dL')).toBe('mg/dL');
      expect(toCanonicalUcum('lbs')).toBe('[lb_av]');
    });

    it('rejects unmapped concepts safely without inventing codes', () => {
      expect(resolveLoincCoding({ type: 'NON_EXISTENT_ASSAY' })).toBeNull();
    });
  });
});

