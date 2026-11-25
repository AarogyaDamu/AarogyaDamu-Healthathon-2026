/**
 * Official LOINC & UCUM Clinical Terminology Mapping Module
 * Standards: LOINC Version 2.77 / 2.78 (Regenstrief Institute, Inc.)
 * Specification: https://loinc.org/
 * UCUM Standard: Unified Code for Units of Measure (http://unitsofmeasure.org)
 */

export interface LoincCoding {
  system: 'http://loinc.org';
  code: string;
  display: string;
  shortName: string;
  category: 'laboratory' | 'vital-signs' | 'exam';
  defaultUcumUnit: string;
  validUcumUnits: string[];
  referenceRange?: {
    low?: number;
    high?: number;
    unit: string;
    text: string;
  };
}

export const LOINC_CODES = {
  // Point-of-Care Capillary Blood Glucose by Glucometer (Mass Concentration: mg/dL)
  GLUCOSE_CAPILLARY_GLUCOMETER: {
    system: 'http://loinc.org',
    code: '41653-7',
    display: 'Glucose [Mass/volume] in Capillary blood by Glucometer',
    shortName: 'Glucose BldC Glucometer-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 130,
      unit: 'mg/dL',
      text: 'Target fasting: 80-130 mg/dL; Target post-meal: <180 mg/dL',
    },
  } as const satisfies LoincCoding,

  // Point-of-Care Capillary Blood Glucose by Glucometer (Substance Concentration: mmol/L)
  GLUCOSE_CAPILLARY_GLUCOMETER_MOLAR: {
    system: 'http://loinc.org',
    code: '14743-9',
    display: 'Glucose [Moles/volume] in Capillary blood by Glucometer',
    shortName: 'Glucose BldC Glucometer-sCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mmol/L',
    validUcumUnits: ['mmol/L'],
    referenceRange: {
      low: 3.9,
      high: 7.2,
      unit: 'mmol/L',
      text: 'Target fasting: 4.4-7.2 mmol/L; Target post-meal: <10.0 mmol/L',
    },
  } as const satisfies LoincCoding,

  // Laboratory Fasting Glucose in Serum or Plasma (Mass Concentration: mg/dL)
  GLUCOSE_FASTING_SERUM: {
    system: 'http://loinc.org',
    code: '1558-6',
    display: 'Fasting glucose [Mass/volume] in Serum or Plasma',
    shortName: 'Glucose SerPl Fast-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 99,
      unit: 'mg/dL',
      text: 'Normal: 70-99 mg/dL; Diabetes diagnostic threshold: >=126 mg/dL; ADA diabetes target: 80-130 mg/dL',
    },
  } as const satisfies LoincCoding,

  // Laboratory Fasting Glucose in Serum or Plasma (Substance Concentration: mmol/L)
  // Authoritative definition of LOINC 14771-0
  GLUCOSE_FASTING_SERUM_MOLAR: {
    system: 'http://loinc.org',
    code: '14771-0',
    display: 'Fasting glucose [Moles/volume] in Serum or Plasma',
    shortName: 'Glucose SerPl Fast-sCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mmol/L',
    validUcumUnits: ['mmol/L'],
    referenceRange: {
      low: 3.9,
      high: 5.5,
      unit: 'mmol/L',
      text: 'Normal fasting: 3.9-5.5 mmol/L; Diabetes threshold: >=7.0 mmol/L',
    },
  } as const satisfies LoincCoding,

  // Laboratory Fasting Glucose in Venous Blood (Mass Concentration: mg/dL)
  GLUCOSE_FASTING_VENOUS: {
    system: 'http://loinc.org',
    code: '1557-8',
    display: 'Fasting glucose [Mass/volume] in Venous blood',
    shortName: 'Glucose BldV Fast-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 99,
      unit: 'mg/dL',
      text: 'Normal fasting: 70-99 mg/dL',
    },
  } as const satisfies LoincCoding,

  // Laboratory Random Glucose in Serum or Plasma (Mass Concentration: mg/dL)
  GLUCOSE_RANDOM_SERUM: {
    system: 'http://loinc.org',
    code: '2345-7',
    display: 'Glucose [Mass/volume] in Serum or Plasma',
    shortName: 'Glucose SerPl-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 140,
      unit: 'mg/dL',
      text: 'Normal random: 70-140 mg/dL',
    },
  } as const satisfies LoincCoding,

  // Whole Blood Random Glucose (Mass Concentration: mg/dL)
  GLUCOSE_RANDOM_BLOOD: {
    system: 'http://loinc.org',
    code: '2339-0',
    display: 'Glucose [Mass/volume] in Blood',
    shortName: 'Glucose Bld-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 180,
      unit: 'mg/dL',
      text: 'Normal random: 70-140 mg/dL; ADA diabetes target: <180 mg/dL',
    },
  } as const satisfies LoincCoding,

  // Whole Blood Glucose (Substance Concentration: mmol/L)
  // Authoritative definition of LOINC 15074-8
  GLUCOSE_BLOOD_MOLAR: {
    system: 'http://loinc.org',
    code: '15074-8',
    display: 'Glucose [Moles/volume] in Blood',
    shortName: 'Glucose Bld-sCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mmol/L',
    validUcumUnits: ['mmol/L'],
    referenceRange: {
      low: 3.9,
      high: 10.0,
      unit: 'mmol/L',
      text: 'Normal random: 3.9-7.8 mmol/L; ADA diabetes target: <10.0 mmol/L',
    },
  } as const satisfies LoincCoding,

  // Preserved alias for capillary glucometer point-of-care (resolves to authoritative 41653-7)
  GLUCOSE_BLOOD_GLUCOMETER: {
    system: 'http://loinc.org',
    code: '41653-7',
    display: 'Glucose [Mass/volume] in Capillary blood by Glucometer',
    shortName: 'Glucose BldC Glucometer-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL'],
    referenceRange: {
      low: 70,
      high: 130,
      unit: 'mg/dL',
      text: 'Target fasting: 80-130 mg/dL; Target post-meal: <180 mg/dL',
    },
  } as const satisfies LoincCoding,

  GLUCOSE_POST_MEAL_2HR: {
    system: 'http://loinc.org',
    code: '88365-2',
    display: 'Glucose [Mass/volume] in Blood at 2 hours post-meal',
    shortName: 'Glucose Bld 2h post meal-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL', 'mmol/L'],
    referenceRange: {
      low: 70,
      high: 140,
      unit: 'mg/dL',
      text: 'Normal: <140 mg/dL; ADA diabetes target: <180 mg/dL',
    },
  } as const satisfies LoincCoding,


  GLUCOSE_PRE_MEAL: {
    system: 'http://loinc.org',
    code: '72171-2',
    display: 'Glucose [Mass/volume] in Blood pre-meal',
    shortName: 'Glucose Bld Pre-meal-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL', 'mmol/L'],
    referenceRange: {
      low: 70,
      high: 130,
      unit: 'mg/dL',
      text: 'ADA diabetes target: 80-130 mg/dL',
    },
  } as const satisfies LoincCoding,

  GLUCOSE_BEDTIME: {
    system: 'http://loinc.org',
    code: '74774-1',
    display: 'Glucose [Mass/volume] in Blood at bedtime',
    shortName: 'Glucose Bld Bedtime-mCnc',
    category: 'laboratory',
    defaultUcumUnit: 'mg/dL',
    validUcumUnits: ['mg/dL', 'mmol/L'],
    referenceRange: {
      low: 100,
      high: 140,
      unit: 'mg/dL',
      text: 'ADA recommended bedtime target: 100-140 mg/dL to prevent nocturnal hypoglycemia',
    },
  } as const satisfies LoincCoding,

  // Glycated Hemoglobin (HbA1c)
  HBA1C_BLOOD: {
    system: 'http://loinc.org',
    code: '4548-4',
    display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
    shortName: 'Hgb A1c MFr Bld',
    category: 'laboratory',
    defaultUcumUnit: '%',
    validUcumUnits: ['%', 'mmol/mol'],
    referenceRange: {
      low: 4.0,
      high: 5.6,
      unit: '%',
      text: 'Normal: <5.7%; Prediabetes: 5.7-6.4%; Diabetes: >=6.5%; ADA Glycemic Target: <7.0%',
    },
  } as const satisfies LoincCoding,

  // Vital Signs
  BLOOD_PRESSURE_PANEL: {
    system: 'http://loinc.org',
    code: '85354-9',
    display: 'Blood pressure panel with all children optional',
    shortName: 'BP panel',
    category: 'vital-signs',
    defaultUcumUnit: 'mm[Hg]',
    validUcumUnits: ['mm[Hg]', 'mmHg'],
  } as const satisfies LoincCoding,

  BP_SYSTOLIC: {
    system: 'http://loinc.org',
    code: '8480-6',
    display: 'Systolic blood pressure',
    shortName: 'BP syst',
    category: 'vital-signs',
    defaultUcumUnit: 'mm[Hg]',
    validUcumUnits: ['mm[Hg]', 'mmHg'],
    referenceRange: {
      low: 90,
      high: 120,
      unit: 'mm[Hg]',
      text: 'Normal: <120 mm[Hg]; Diabetes target: <130 mm[Hg]',
    },
  } as const satisfies LoincCoding,

  BP_DIASTOLIC: {
    system: 'http://loinc.org',
    code: '8462-4',
    display: 'Diastolic blood pressure',
    shortName: 'BP diast',
    category: 'vital-signs',
    defaultUcumUnit: 'mm[Hg]',
    validUcumUnits: ['mm[Hg]', 'mmHg'],
    referenceRange: {
      low: 60,
      high: 80,
      unit: 'mm[Hg]',
      text: 'Normal: <80 mm[Hg]; Diabetes target: <80 mm[Hg]',
    },
  } as const satisfies LoincCoding,

  BODY_WEIGHT: {
    system: 'http://loinc.org',
    code: '29463-7',
    display: 'Body weight',
    shortName: 'Body weight',
    category: 'vital-signs',
    defaultUcumUnit: 'kg',
    validUcumUnits: ['kg', '[lb_av]', 'lbs'],
  } as const satisfies LoincCoding,

  HEART_RATE: {
    system: 'http://loinc.org',
    code: '8867-4',
    display: 'Heart rate',
    shortName: 'Heart rate',
    category: 'vital-signs',
    defaultUcumUnit: '/min',
    validUcumUnits: ['/min', '{beats}/min'],
    referenceRange: {
      low: 60,
      high: 100,
      unit: '/min',
      text: 'Normal resting: 60-100 /min',
    },
  } as const satisfies LoincCoding,

  BMI: {
    system: 'http://loinc.org',
    code: '39156-5',
    display: 'Body mass index (BMI) [Ratio]',
    shortName: 'BMI',
    category: 'vital-signs',
    defaultUcumUnit: 'kg/m2',
    validUcumUnits: ['kg/m2'],
    referenceRange: {
      low: 18.5,
      high: 24.9,
      unit: 'kg/m2',
      text: 'Normal: 18.5-24.9 kg/m2 (Asian Indian normal: 18.5-22.9 kg/m2)',
    },
  } as const satisfies LoincCoding,
} as const;

/**
 * Standard UCUM Unit Canonicalization
 */
export const UCUM_UNIT_CANONICAL: Record<string, string> = {
  'mg/dL': 'mg/dL',
  'mg/dl': 'mg/dL',
  'mmol/L': 'mmol/L',
  'mmol/l': 'mmol/L',
  '%': '%',
  'percent': '%',
  'mmHg': 'mm[Hg]',
  'mm[Hg]': 'mm[Hg]',
  'kg': 'kg',
  'lbs': '[lb_av]',
  '[lb_av]': '[lb_av]',
  '/min': '/min',
  'bpm': '/min',
  'kg/m2': 'kg/m2',
};

/**
 * Resolves verified LOINC coding based on clinical measurement type, specimen, context, and provenance.
 */
export function resolveLoincCoding(params: {
  type: 'BLOOD_GLUCOSE' | 'HBA1C' | 'BLOOD_PRESSURE' | 'WEIGHT' | 'HEART_RATE' | string;
  context?: string;
  provenance?: string;
  unit?: string;
  specimen?: string;
}): LoincCoding | null {
  const { type, context, provenance, unit, specimen } = params;
  const canonicalUnit = unit ? toCanonicalUcum(unit) : undefined;

  if (type === 'BLOOD_GLUCOSE') {
    // Substance concentration (mmol/L) branch
    if (canonicalUnit === 'mmol/L') {
      if (context === 'FASTING') {
        if (provenance === 'LAB_CONFIRMED' || provenance === 'LAB_REPORT' || specimen === 'SERUM_PLASMA') {
          return LOINC_CODES.GLUCOSE_FASTING_SERUM_MOLAR; // 14771-0 (Fasting glucose in Serum/Plasma, mmol/L)
        }
        return LOINC_CODES.GLUCOSE_CAPILLARY_GLUCOMETER_MOLAR; // 14743-9 (Capillary glucometer, mmol/L)
      }
      if (context === 'RANDOM') {
        return LOINC_CODES.GLUCOSE_BLOOD_MOLAR; // 15074-8 (Whole blood glucose, mmol/L)
      }
      return LOINC_CODES.GLUCOSE_CAPILLARY_GLUCOMETER_MOLAR; // 14743-9 (Default molar POC glucometer)
    }

    // Mass concentration (mg/dL) branch (Default clinical standard for AarogyaDamu)
    if (context === 'FASTING') {
      if (provenance === 'LAB_CONFIRMED' || provenance === 'LAB_REPORT' || specimen === 'SERUM_PLASMA') {
        return LOINC_CODES.GLUCOSE_FASTING_SERUM; // 1558-6 (Fasting glucose in Serum/Plasma, mg/dL)
      }
      if (provenance === 'VENOUS_BLOOD' || specimen === 'VENOUS_BLOOD') {
        return LOINC_CODES.GLUCOSE_FASTING_VENOUS; // 1557-8 (Fasting glucose in Venous blood, mg/dL)
      }
      return LOINC_CODES.GLUCOSE_CAPILLARY_GLUCOMETER; // 41653-7 (Capillary blood by Glucometer, mg/dL)
    }
    if (context === 'POST_MEAL_2HR' || context === 'POST_MEAL') {
      return LOINC_CODES.GLUCOSE_POST_MEAL_2HR; // 88365-2 (Blood at 2h post-meal, mg/dL)
    }
    if (context === 'PRE_MEAL') {
      return LOINC_CODES.GLUCOSE_PRE_MEAL; // 72171-2 (Blood pre-meal, mg/dL)
    }
    if (context === 'BEDTIME') {
      return LOINC_CODES.GLUCOSE_BEDTIME; // 74774-1 (Blood at bedtime, mg/dL)
    }
    if (context === 'RANDOM') {
      if (provenance === 'LAB_CONFIRMED' || provenance === 'LAB_REPORT' || specimen === 'SERUM_PLASMA') {
        return LOINC_CODES.GLUCOSE_RANDOM_SERUM; // 2345-7 (Serum/Plasma random, mg/dL)
      }
      return LOINC_CODES.GLUCOSE_RANDOM_BLOOD; // 2339-0 (Whole blood random, mg/dL)
    }
    // Default point-of-care capillary glucometer reading (mg/dL)
    return LOINC_CODES.GLUCOSE_CAPILLARY_GLUCOMETER; // 41653-7
  }

  if (type === 'HBA1C') {
    return LOINC_CODES.HBA1C_BLOOD; // 4548-4 (Hemoglobin A1c in Blood, %)
  }

  if (type === 'BLOOD_PRESSURE') {
    return LOINC_CODES.BLOOD_PRESSURE_PANEL; // 85354-9 (BP panel, mm[Hg])
  }

  if (type === 'WEIGHT') {
    return LOINC_CODES.BODY_WEIGHT; // 29463-7 (Body weight, kg)
  }

  if (type === 'HEART_RATE') {
    return LOINC_CODES.HEART_RATE; // 8867-4 (Heart rate, /min)
  }

  return null;
}

/**
 * Validates clinical observation properties to prevent incorrect specimen, fasting-state, and unit combinations.
 */
export function validateClinicalObservationTerminology(obs: {
  type: string;
  unit?: string;
  context?: string;
  provenance?: string;
  specimen?: string;
  numericValue?: number;
}): { valid: boolean; error?: string; loinc?: LoincCoding } {
  const loinc = resolveLoincCoding(obs);
  if (!loinc) {
    return { valid: false, error: `Unsupported observation type: ${obs.type}` };
  }

  if (obs.unit) {
    const canonical = toCanonicalUcum(obs.unit);
    const isValidUnit = loinc.validUcumUnits.some((u) => toCanonicalUcum(u) === canonical);
    if (!isValidUnit) {
      return {
        valid: false,
        error: `Incompatible UCUM unit '${obs.unit}' for LOINC ${loinc.code} (${loinc.display}). Expected one of: ${loinc.validUcumUnits.join(', ')}`,
      };
    }
  }

  // Clinical consistency checks
  if (obs.type === 'BLOOD_GLUCOSE') {
    if (obs.provenance === 'LAB_CONFIRMED' && obs.specimen === 'CAPILLARY_BLOOD') {
      return {
        valid: false,
        error: 'Clinical conflict: LAB_CONFIRMED provenance cannot have CAPILLARY_BLOOD specimen (standard lab requires venous serum/plasma).',
      };
    }
  }

  return { valid: true, loinc };
}

/**
 * Standardize measurement unit to official UCUM string
 */
export function toCanonicalUcum(unit: string): string {
  return UCUM_UNIT_CANONICAL[unit] || unit;
}

