/**
 * Automated Verification & Validation Suite for LOINC & UCUM Clinical Terminology
 * Standards: LOINC 2.77 / 2.78, UCUM 2.1
 */

import {
  LOINC_CODES,
  resolveLoincCoding,
  toCanonicalUcum,
  UCUM_UNIT_CANONICAL,
} from '../loinc';

describe('LOINC & UCUM Clinical Terminology Mapping Suite', () => {
  describe('1. Blood Glucose Observation LOINC Mappings', () => {
    it('resolves point-of-care fasting glucose to LOINC 14771-0', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        provenance: 'PATIENT_ENTERED',
      });

      expect(coding).not.toBeNull();
      expect(coding?.code).toBe('14771-0');
      expect(coding?.display).toBe('Glucose [Mass/volume] in Blood by Glucometer');
      expect(coding?.defaultUcumUnit).toBe('mg/dL');
      expect(coding?.category).toBe('laboratory');
    });

    it('resolves venous fasting laboratory glucose to LOINC 1558-6', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        provenance: 'LAB_CONFIRMED',
      });

      expect(coding?.code).toBe('1558-6');
      expect(coding?.display).toBe('Fasting glucose [Mass/volume] in Serum or Plasma');
    });

    it('resolves 2-hour postprandial glucose to LOINC 88365-2', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'POST_MEAL_2HR',
      });

      expect(coding?.code).toBe('88365-2');
      expect(coding?.display).toBe('Glucose [Mass/volume] in Blood at 2 hours post-meal');
    });

    it('resolves pre-meal glucose to LOINC 72171-2', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'PRE_MEAL',
      });

      expect(coding?.code).toBe('72171-2');
      expect(coding?.display).toBe('Glucose [Mass/volume] in Blood pre-meal');
    });

    it('resolves bedtime glucose to LOINC 74774-1', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'BEDTIME',
      });

      expect(coding?.code).toBe('74774-1');
      expect(coding?.display).toBe('Glucose [Mass/volume] in Blood at bedtime');
    });
  });

  describe('2. Glycated Hemoglobin (HbA1c) LOINC Mapping', () => {
    it('resolves HbA1c to LOINC 4548-4 with valid UCUM % and mmol/mol', () => {
      const coding = resolveLoincCoding({ type: 'HBA1C' });

      expect(coding?.code).toBe('4548-4');
      expect(coding?.display).toBe('Hemoglobin A1c/Hemoglobin.total in Blood');
      expect(coding?.defaultUcumUnit).toBe('%');
      expect(coding?.validUcumUnits).toContain('%');
      expect(coding?.validUcumUnits).toContain('mmol/mol');
      expect(coding?.referenceRange?.text).toContain('ADA Glycemic Target: <7.0%');
    });
  });

  describe('3. Vital Signs LOINC Mappings', () => {
    it('resolves Blood Pressure to LOINC 85354-9 with systolic and diastolic children', () => {
      const coding = resolveLoincCoding({ type: 'BLOOD_PRESSURE' });
      expect(coding?.code).toBe('85354-9');
      expect(coding?.category).toBe('vital-signs');

      // Verify individual component codes
      expect(LOINC_CODES.BP_SYSTOLIC.code).toBe('8480-6');
      expect(LOINC_CODES.BP_SYSTOLIC.defaultUcumUnit).toBe('mm[Hg]');
      expect(LOINC_CODES.BP_DIASTOLIC.code).toBe('8462-4');
      expect(LOINC_CODES.BP_DIASTOLIC.defaultUcumUnit).toBe('mm[Hg]');
    });

    it('resolves Body Weight to LOINC 29463-7 with UCUM kg', () => {
      const coding = resolveLoincCoding({ type: 'WEIGHT' });
      expect(coding?.code).toBe('29463-7');
      expect(coding?.defaultUcumUnit).toBe('kg');
      expect(coding?.category).toBe('vital-signs');
    });

    it('resolves Heart Rate to LOINC 8867-4 with UCUM /min', () => {
      const coding = resolveLoincCoding({ type: 'HEART_RATE' });
      expect(coding?.code).toBe('8867-4');
      expect(coding?.defaultUcumUnit).toBe('/min');
    });
  });

  describe('4. UCUM Unit Canonicalization', () => {
    it('canonicalizes standard units into official case-sensitive UCUM strings', () => {
      expect(toCanonicalUcum('mmHg')).toBe('mm[Hg]');
      expect(toCanonicalUcum('mm[Hg]')).toBe('mm[Hg]');
      expect(toCanonicalUcum('mg/dL')).toBe('mg/dL');
      expect(toCanonicalUcum('mg/dl')).toBe('mg/dL');
      expect(toCanonicalUcum('%')).toBe('%');
      expect(toCanonicalUcum('kg')).toBe('kg');
      expect(toCanonicalUcum('lbs')).toBe('[lb_av]');
      expect(toCanonicalUcum('bpm')).toBe('/min');
    });
  });

  describe('5. Safety & Explicit Error Handling (No Invented Codes)', () => {
    it('returns null for unmapped clinical types instead of fabricating codes', () => {
      expect(resolveLoincCoding({ type: 'UNSUPPORTED_GENOMIC_ASSAY' })).toBeNull();
      expect(resolveLoincCoding({ type: 'RANDOM_STRING_XYZ' })).toBeNull();
    });

    it('ensures every LOINC code strictly points to http://loinc.org', () => {
      Object.values(LOINC_CODES).forEach((entry) => {
        expect(entry.system).toBe('http://loinc.org');
        expect(entry.code).toMatch(/^\d{3,5}-\d$/);
      });
    });
  });
});

