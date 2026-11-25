/**
 * Automated Verification & Validation Suite for LOINC & UCUM Clinical Terminology
 * Standards: LOINC 2.77 / 2.78, UCUM 2.1
 */

import { describe, it, expect } from 'vitest';
import {
  LOINC_CODES,
  resolveLoincCoding,
  toCanonicalUcum,
  validateClinicalObservationTerminology,
  UCUM_UNIT_CANONICAL,
} from '../loinc';

describe('LOINC & UCUM Clinical Terminology Mapping Suite', () => {
  describe('1. Blood Glucose Observation LOINC Mappings', () => {
    it('resolves point-of-care capillary fasting glucose (mg/dL) to authoritative LOINC 41653-7', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        provenance: 'PATIENT_ENTERED',
        unit: 'mg/dL',
      });

      expect(coding).not.toBeNull();
      expect(coding?.code).toBe('41653-7');
      expect(coding?.display).toBe('Glucose [Mass/volume] in Capillary blood by Glucometer');
      expect(coding?.defaultUcumUnit).toBe('mg/dL');
      expect(coding?.category).toBe('laboratory');
    });

    it('resolves molar fasting serum glucose (mmol/L) to authoritative LOINC 14771-0', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        provenance: 'LAB_CONFIRMED',
        unit: 'mmol/L',
      });

      expect(coding?.code).toBe('14771-0');
      expect(coding?.display).toBe('Fasting glucose [Moles/volume] in Serum or Plasma');
      expect(coding?.defaultUcumUnit).toBe('mmol/L');
    });

    it('resolves molar whole blood glucose (mmol/L) to authoritative LOINC 15074-8', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'RANDOM',
        unit: 'mmol/L',
      });

      expect(coding?.code).toBe('15074-8');
      expect(coding?.display).toBe('Glucose [Moles/volume] in Blood');
      expect(coding?.defaultUcumUnit).toBe('mmol/L');
    });

    it('resolves molar capillary glucometer glucose (mmol/L) to LOINC 14743-9', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        provenance: 'PATIENT_ENTERED',
        unit: 'mmol/L',
      });

      expect(coding?.code).toBe('14743-9');
      expect(coding?.display).toBe('Glucose [Moles/volume] in Capillary blood by Glucometer');
      expect(coding?.defaultUcumUnit).toBe('mmol/L');
    });

    it('resolves venous fasting laboratory glucose (mg/dL) to LOINC 1558-6', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        provenance: 'LAB_CONFIRMED',
        unit: 'mg/dL',
      });

      expect(coding?.code).toBe('1558-6');
      expect(coding?.display).toBe('Fasting glucose [Mass/volume] in Serum or Plasma');
      expect(coding?.defaultUcumUnit).toBe('mg/dL');
    });

    it('resolves fasting venous blood glucose to LOINC 1557-8', () => {
      const coding = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'FASTING',
        specimen: 'VENOUS_BLOOD',
      });

      expect(coding?.code).toBe('1557-8');
      expect(coding?.display).toBe('Fasting glucose [Mass/volume] in Venous blood');
    });

    it('resolves random serum glucose to LOINC 2345-7 and random blood to LOINC 2339-0', () => {
      const labRandom = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'RANDOM',
        provenance: 'LAB_CONFIRMED',
      });
      expect(labRandom?.code).toBe('2345-7');

      const bloodRandom = resolveLoincCoding({
        type: 'BLOOD_GLUCOSE',
        context: 'RANDOM',
      });
      expect(bloodRandom?.code).toBe('2339-0');
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

  describe('6. Regression Tests for Clinical Observation Validity', () => {
    it('validates correct glucose observation with mg/dL', () => {
      const result = validateClinicalObservationTerminology({
        type: 'BLOOD_GLUCOSE',
        unit: 'mg/dL',
        context: 'FASTING',
      });
      expect(result.valid).toBe(true);
      expect(result.loinc?.code).toBe('41653-7');
    });

    it('validates correct molar glucose observation with mmol/L', () => {
      const result = validateClinicalObservationTerminology({
        type: 'BLOOD_GLUCOSE',
        unit: 'mmol/L',
        context: 'FASTING',
        provenance: 'LAB_CONFIRMED',
      });
      expect(result.valid).toBe(true);
      expect(result.loinc?.code).toBe('14771-0');
    });

    it('rejects incompatible UCUM units for clinical observation', () => {
      const invalidGlucose = validateClinicalObservationTerminology({
        type: 'BLOOD_GLUCOSE',
        unit: 'mm[Hg]',
      });
      expect(invalidGlucose.valid).toBe(false);
      expect(invalidGlucose.error).toContain('Incompatible UCUM unit');

      const invalidWeight = validateClinicalObservationTerminology({
        type: 'WEIGHT',
        unit: '%',
      });
      expect(invalidWeight.valid).toBe(false);
      expect(invalidWeight.error).toContain('Incompatible UCUM unit');
    });

    it('rejects clinical specimen conflicts (e.g., LAB_CONFIRMED with CAPILLARY_BLOOD)', () => {
      const conflict = validateClinicalObservationTerminology({
        type: 'BLOOD_GLUCOSE',
        provenance: 'LAB_CONFIRMED',
        specimen: 'CAPILLARY_BLOOD',
      });
      expect(conflict.valid).toBe(false);
      expect(conflict.error).toContain('Clinical conflict');
    });
  });
});

