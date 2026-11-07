import { ClinicalFlag, ClinicalSafetyThresholds } from '@aarogyadamu/contracts';

export interface ClinicalContext {
  hasSevereSymptoms?: boolean;        // acute chest pain, dyspnea, confusion, focal neuro deficit, DKA signs
  requiresAssistance?: boolean;       // third-party assistance required to ingest oral carbs / glucagon (Level 3 Hypo)
  isRepeatMeasurement?: boolean;     // confirmed reading after 5-minute seated rest or 15-minute retest
  symptoms?: string[];                // list of self-reported symptoms
}

export interface IndividualizedTargets {
  targetFastingMin?: number;          // clinician-approved lower fasting target (default 80 mg/dL)
  targetFastingMax?: number;          // clinician-approved upper fasting target (default 130 mg/dL)
  targetPostMealMax?: number;         // clinician-approved 2h postprandial target (default 180 mg/dL)
  targetHbA1cMax?: number;            // clinician-approved individualized HbA1c target (default 7.0%)
  targetSystolicMax?: number;         // clinician-approved systolic target (default 130 mmHg)
  targetDiastolicMax?: number;        // clinician-approved diastolic target (default 80 mmHg)
}

export interface SafetyEvaluationInput {
  type: string;
  numericValue: number;
  secondaryValue?: number | null;
  unit?: string;
  context?: string | null;
  clinicalContext?: ClinicalContext;
  individualizedTargets?: IndividualizedTargets;
}

export interface SafetyEvaluationResult {
  clinicalFlag: ClinicalFlag;
  isCritical: boolean;
  requiresEmergencyEscalation: boolean;
  clinicalCategory: string;
  clinicalMessage: string;
  actionableGuidance: string;
  guidelineReference: string;
  individualizedTargetApplied: boolean;
}

/**
 * Deterministic Clinical Safety Evaluator
 * Compliant with ADA Standards of Care in Diabetes (2026) and ACC/AHA (2017) Guidelines.
 * Evaluates vital measurements against verified clinical thresholds without LLM hallucination.
 */
export function evaluateClinicalSafety(input: SafetyEvaluationInput): SafetyEvaluationResult {
  const { type, numericValue, secondaryValue, context, clinicalContext, individualizedTargets } = input;
  const upperType = (type || 'BLOOD_GLUCOSE').toUpperCase();
  const ctx = (context || 'GENERAL').toUpperCase();

  switch (upperType) {
    case 'BLOOD_GLUCOSE': {
      // 1. Level 2 or Level 3 Hypoglycemia (< 54 mg/dL)
      if (numericValue < ClinicalSafetyThresholds.GLUCOSE.CRITICAL_LOW) {
        const isLevel3 = Boolean(clinicalContext?.requiresAssistance || clinicalContext?.hasSevereSymptoms);

        if (isLevel3) {
          return {
            clinicalFlag: 'CRITICAL_LOW',
            isCritical: true,
            requiresEmergencyEscalation: true,
            clinicalCategory: 'HYPOGLYCEMIA_LEVEL_3',
            clinicalMessage: `Severe hypoglycemia (Level 3, ${numericValue} mg/dL) with cognitive/physical impairment requiring third-party assistance.`,
            actionableGuidance: 'EMERGENCY ACTION: Administer prescribed emergency glucagon or call emergency medical services immediately. Do not place food or liquids in mouth if the person is confused or unconscious. Place on their side in recovery position.',
            guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
            individualizedTargetApplied: false,
          };
        }

        // Conscious Level 2 Hypoglycemia (<54 mg/dL): Critical, but patient can self-treat initially
        return {
          clinicalFlag: 'CRITICAL_LOW',
          isCritical: true,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'HYPOGLYCEMIA_LEVEL_2',
          clinicalMessage: `Clinically significant hypoglycemia (Level 2, ${numericValue} mg/dL). Immediate rapid carbohydrate intake required.`,
          actionableGuidance: 'Consume 15-20g fast-acting glucose immediately (e.g. 4 glucose tablets, 1/2 cup fruit juice, or 1/2 can regular soda). Sit down, rest, and recheck in 15 minutes. If reading remains below 54 mg/dL after 2 treatments or you feel disoriented, call for emergency assistance.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: false,
        };
      }

      // 2. Level 1 Hypoglycemia (54 to 69 mg/dL)
      if (numericValue < ClinicalSafetyThresholds.GLUCOSE.ALERT_LOW) {
        return {
          clinicalFlag: 'LOW',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'HYPOGLYCEMIA_LEVEL_1',
          clinicalMessage: `Hypoglycemia alert (Level 1, ${numericValue} mg/dL). Below safe physiological threshold.`,
          actionableGuidance: 'Apply the Rule of 15: Ingest 15g simple carbohydrates (such as 4 oz fruit juice or 3-4 glucose tablets). Wait 15 minutes and re-test. Once glucose is 70 mg/dL or higher, consume your regular meal or a complex carbohydrate snack.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: false,
        };
      }

      // 3. Hyperglycemia Alert and Severe Hyperglycemia (>= 250 mg/dL)
      if (numericValue > ClinicalSafetyThresholds.GLUCOSE.ALERT_HIGH) {
        const hasDkaSymptoms = Boolean(clinicalContext?.hasSevereSymptoms);

        if (hasDkaSymptoms) {
          return {
            clinicalFlag: 'CRITICAL_HIGH',
            isCritical: true,
            requiresEmergencyEscalation: true,
            clinicalCategory: 'HYPERGLYCEMIC_EMERGENCY_DKA_HHS',
            clinicalMessage: `Marked hyperglycemia (${numericValue} mg/dL) with acute symptoms (possible DKA or hyperosmolar state).`,
            actionableGuidance: 'EMERGENCY ACTION: Seek immediate emergency medical care or contact your physician. Check blood/urine ketones immediately if a meter is available. Drink sugar-free fluids if alert.',
            guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets & Hyperglycemic Crises)',
            individualizedTargetApplied: false,
          };
        }

        // Asymptomatic Marked Hyperglycemia (Alert threshold: 250 mg/dL, Severe: >= 300 mg/dL)
        return {
          clinicalFlag: 'CRITICAL_HIGH',
          isCritical: true,
          requiresEmergencyEscalation: false,
          clinicalCategory: numericValue >= ClinicalSafetyThresholds.GLUCOSE.CRITICAL_HIGH ? 'SEVERE_HYPERGLYCEMIA_ALERT' : 'HYPERGLYCEMIA_ALERT',
          clinicalMessage: `Marked hyperglycemia reading (${numericValue} mg/dL). Well above standard clinical targets.`,
          actionableGuidance: 'Drink plenty of water. Check blood or urine ketones if instructed by your clinician. Administer correction insulin only if pre-prescribed by your physician. Contact your care team if high readings persist.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: false,
        };
      }

      // 4. Target Range Evaluation (Configurable with Clinician-Approved Patient Profile)
      const fastingMin = individualizedTargets?.targetFastingMin ?? ClinicalSafetyThresholds.GLUCOSE.TARGET_FASTING_MIN; // 80
      const fastingMax = individualizedTargets?.targetFastingMax ?? ClinicalSafetyThresholds.GLUCOSE.TARGET_FASTING_MAX; // 130
      const postMealMax = individualizedTargets?.targetPostMealMax ?? ClinicalSafetyThresholds.GLUCOSE.TARGET_POST_MEAL_MAX; // 180
      const hasCustomTargets = Boolean(
        individualizedTargets?.targetFastingMin ||
        individualizedTargets?.targetFastingMax ||
        individualizedTargets?.targetPostMealMax
      );

      // Fasting or Pre-meal context
      if (ctx === 'FASTING' || ctx === 'PRE_MEAL') {
        if (numericValue >= fastingMin && numericValue <= fastingMax) {
          return {
            clinicalFlag: 'IN_TARGET',
            isCritical: false,
            requiresEmergencyEscalation: false,
            clinicalCategory: 'GLUCOSE_IN_TARGET',
            clinicalMessage: `Optimal fasting blood sugar (${numericValue} mg/dL) within ${hasCustomTargets ? 'clinician-approved individualized' : 'ADA recommended'} target (${fastingMin}-${fastingMax} mg/dL).`,
            actionableGuidance: 'Maintain current nutrition, medication adherence, and hydration schedule.',
            guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
            individualizedTargetApplied: hasCustomTargets,
          };
        }

        // Low-normal fasting (70-79 mg/dL)
        if (numericValue >= 70 && numericValue < fastingMin) {
          return {
            clinicalFlag: 'IN_TARGET',
            isCritical: false,
            requiresEmergencyEscalation: false,
            clinicalCategory: 'GLUCOSE_LOW_NORMAL',
            clinicalMessage: `Fasting blood sugar (${numericValue} mg/dL) is in the lower normal physiological range (70-${fastingMin - 1} mg/dL).`,
            actionableGuidance: 'Eat your scheduled breakfast or morning meal promptly to maintain stability.',
            guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
            individualizedTargetApplied: hasCustomTargets,
          };
        }

        return {
          clinicalFlag: 'HIGH',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'GLUCOSE_ELEVATED_FASTING',
          clinicalMessage: `Fasting blood sugar (${numericValue} mg/dL) is above the target of ${fastingMax} mg/dL.`,
          actionableGuidance: 'Log meal timings and medication adherence. Review glycemic trends with your clinician.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: hasCustomTargets,
        };
      }

      // Post-prandial context (2-hour post-meal)
      if (ctx === 'POST_MEAL' || ctx === 'POST_MEAL_2HR') {
        if (numericValue <= postMealMax) {
          return {
            clinicalFlag: 'IN_TARGET',
            isCritical: false,
            requiresEmergencyEscalation: false,
            clinicalCategory: 'GLUCOSE_IN_TARGET',
            clinicalMessage: `Post-meal blood sugar (${numericValue} mg/dL) is within target (<= ${postMealMax} mg/dL).`,
            actionableGuidance: 'Continue healthy post-meal lifestyle habits and hydration.',
            guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
            individualizedTargetApplied: hasCustomTargets,
          };
        }

        return {
          clinicalFlag: 'HIGH',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'GLUCOSE_ELEVATED_POST_MEAL',
          clinicalMessage: `Post-meal blood sugar (${numericValue} mg/dL) exceeds target of ${postMealMax} mg/dL.`,
          actionableGuidance: 'Note carbohydrate portion and physical activity. Discuss adjustment with your healthcare provider.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: hasCustomTargets,
        };
      }

      // Bedtime, Random, or General context
      if (numericValue >= 80 && numericValue <= 140) {
        return {
          clinicalFlag: 'IN_TARGET',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'GLUCOSE_IN_TARGET',
          clinicalMessage: `Blood glucose (${numericValue} mg/dL) within expected daytime target range (80-140 mg/dL).`,
          actionableGuidance: 'Stay on course with your care plan goals.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: false,
        };
      }

      // 70-79 in random/general context is acceptable normal
      if (numericValue >= 70 && numericValue < 80) {
        return {
          clinicalFlag: 'IN_TARGET',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'GLUCOSE_LOW_NORMAL',
          clinicalMessage: `Blood glucose (${numericValue} mg/dL) is in the safe physiological reference range (70-79 mg/dL).`,
          actionableGuidance: 'Continue regular meal routines and hydration.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: false,
        };
      }

      return {
        clinicalFlag: numericValue < 70 ? 'LOW' : 'HIGH',
        isCritical: false,
        requiresEmergencyEscalation: false,
        clinicalCategory: numericValue < 70 ? 'HYPOGLYCEMIA_LEVEL_1' : 'GLUCOSE_ELEVATED',
        clinicalMessage: `Glucose reading (${numericValue} mg/dL) is outside typical target parameters.`,
        actionableGuidance: 'Record context notes and follow prescribed self-monitoring frequency.',
        guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
        individualizedTargetApplied: false,
      };
    }

    case 'BLOOD_PRESSURE': {
      const systolic = numericValue;
      const diastolic = secondaryValue ?? 80;
      const isSevereReading = systolic >= ClinicalSafetyThresholds.BLOOD_PRESSURE.CRISIS_SYS_MIN ||
                              diastolic >= ClinicalSafetyThresholds.BLOOD_PRESSURE.CRISIS_DIA_MIN;

      // 1. Severe BP Elevation / Crisis Range (Systolic >= 180 OR Diastolic >= 120)
      if (isSevereReading) {
        const hasAcuteSymptoms = Boolean(clinicalContext?.hasSevereSymptoms);

        if (hasAcuteSymptoms) {
          // Hypertensive Emergency (Severe BP + acute target-organ damage symptoms)
          return {
            clinicalFlag: 'HYPERTENSIVE_CRISIS',
            isCritical: true,
            requiresEmergencyEscalation: true,
            clinicalCategory: 'HYPERTENSIVE_EMERGENCY',
            clinicalMessage: `Hypertensive emergency range detected (${systolic}/${diastolic} mmHg) accompanied by concerning acute symptoms.`,
            actionableGuidance: 'EMERGENCY ACTION: Call emergency medical services (108/911/112) or proceed to the nearest emergency department immediately. Do not drive yourself. Rest quietly in a comfortable position while awaiting medical help.',
            guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
            individualizedTargetApplied: false,
          };
        }

        // Asymptomatic Severe Hypertension (Hypertensive Urgency / Severe Isolated Elevation)
        // A single home reading without acute symptoms does NOT constitute an emergency dispatch
        return {
          clinicalFlag: 'HYPERTENSIVE_CRISIS',
          isCritical: true,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'SEVERE_HYPERTENSION_ASYMPTOMATIC',
          clinicalMessage: `Severe blood pressure elevation (${systolic}/${diastolic} mmHg). Note: A single home reading does not constitute a clinical emergency without acute symptoms.`,
          actionableGuidance: 'Rest quietly in a seated position with feet flat on the floor for 5 minutes, then repeat the measurement. If the repeat reading remains at or above 180/120 mmHg, contact your physician or urgent care clinic promptly. Seek immediate emergency care if chest pain, shortness of breath, severe headache, or numbness develop.',
          guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
          individualizedTargetApplied: false,
        };
      }

      // 2. Stage 2 Hypertension (Systolic >= 140 OR Diastolic >= 90)
      if (systolic >= ClinicalSafetyThresholds.BLOOD_PRESSURE.STAGE_2_SYS_MIN || diastolic >= ClinicalSafetyThresholds.BLOOD_PRESSURE.STAGE_2_DIA_MIN) {
        return {
          clinicalFlag: 'STAGE_2_HYPERTENSION',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'STAGE_2_HYPERTENSION',
          clinicalMessage: `Stage 2 elevated blood pressure reading (${systolic}/${diastolic} mmHg). Note: Clinical diagnosis requires multiple confirmed readings over time.`,
          actionableGuidance: 'Adhere to prescribed antihypertensive medications and low-sodium dietary guidelines. Continue regular daily logging and share your trend log with your doctor.',
          guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
          individualizedTargetApplied: false,
        };
      }

      // 3. Stage 1 Hypertension (Systolic 130-139 OR Diastolic 80-89)
      if (
        (systolic >= 130 && systolic <= ClinicalSafetyThresholds.BLOOD_PRESSURE.STAGE_1_SYS_MAX) ||
        (diastolic >= 80 && diastolic <= ClinicalSafetyThresholds.BLOOD_PRESSURE.STAGE_1_DIA_MAX)
      ) {
        return {
          clinicalFlag: 'STAGE_1_HYPERTENSION',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'STAGE_1_HYPERTENSION',
          clinicalMessage: `Stage 1 elevated blood pressure reading (${systolic}/${diastolic} mmHg).`,
          actionableGuidance: 'Focus on heart-healthy nutrition (DASH diet), physical activity, and stress management. Continue periodic home blood pressure monitoring.',
          guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
          individualizedTargetApplied: false,
        };
      }

      // 4. Elevated Blood Pressure (Systolic 120-129 AND Diastolic < 80)
      if (systolic >= 120 && systolic <= ClinicalSafetyThresholds.BLOOD_PRESSURE.ELEVATED_SYS_MAX && diastolic < 80) {
        return {
          clinicalFlag: 'ELEVATED',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'ELEVATED_BLOOD_PRESSURE',
          clinicalMessage: `Elevated systolic blood pressure (${systolic}/${diastolic} mmHg).`,
          actionableGuidance: 'Systolic pressure is slightly above normal. Lifestyle measures (aerobic exercise, balanced nutrition) can help prevent progression to hypertension.',
          guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
          individualizedTargetApplied: false,
        };
      }

      // 5. Normal Blood Pressure (Systolic < 120 AND Diastolic < 80)
      return {
        clinicalFlag: 'NORMAL',
        isCritical: false,
        requiresEmergencyEscalation: false,
        clinicalCategory: 'NORMAL_BLOOD_PRESSURE',
        clinicalMessage: `Normal blood pressure reading (${systolic}/${diastolic} mmHg).`,
        actionableGuidance: 'Blood pressure is within standard normal clinical limits (<120/<80 mmHg).',
        guidelineReference: 'ACC/AHA 2017 & ADA Standards of Care 2026: Section 10 (Cardiovascular Disease)',
        individualizedTargetApplied: false,
      };
    }

    case 'HBA1C': {
      const customA1cTarget = individualizedTargets?.targetHbA1cMax ?? ClinicalSafetyThresholds.HBA1C.ADA_STANDARD_TARGET; // 7.0%
      const hasCustomA1cTarget = Boolean(individualizedTargets?.targetHbA1cMax);

      // Significant elevation (> 8.5%)
      if (numericValue > ClinicalSafetyThresholds.HBA1C.HIGH_RISK_THRESHOLD) {
        return {
          clinicalFlag: 'CRITICAL_HIGH',
          isCritical: true,
          requiresEmergencyEscalation: false, // HbA1c is a 3-month retrospective marker, never an acute emergency
          clinicalCategory: 'HBA1C_CRITICAL_HIGH',
          clinicalMessage: `Significantly elevated HbA1c (${numericValue}%). Indicates suboptimal long-term glycemic control and elevated risk of microvascular complications.`,
          actionableGuidance: 'Schedule a comprehensive clinical review with your treating endocrinologist. Note: Prescription or dosage changes must be made exclusively by your licensed clinician.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: hasCustomA1cTarget,
        };
      }

      // Above clinician target
      if (numericValue > customA1cTarget) {
        return {
          clinicalFlag: 'HIGH',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'HBA1C_ABOVE_TARGET',
          clinicalMessage: `HbA1c (${numericValue}%) is above your ${hasCustomA1cTarget ? 'individualized' : 'standard ADA'} target (<${customA1cTarget}%).`,
          actionableGuidance: 'Review your daily blood glucose patterns with your healthcare provider to identify opportunities to increase time-in-range (TIR).',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: hasCustomA1cTarget,
        };
      }

      // Diabetes meeting clinical target (6.5% up to custom target)
      if (numericValue >= ClinicalSafetyThresholds.HBA1C.DIABETES_MIN) {
        return {
          clinicalFlag: 'IN_TARGET',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'HBA1C_IN_TARGET',
          clinicalMessage: `HbA1c (${numericValue}%) meets your clinician-approved clinical target (<${customA1cTarget}%).`,
          actionableGuidance: 'Excellent glycemic control. Continue maintaining your current diet, physical activity, and medication routine.',
          guidelineReference: 'ADA Standards of Care 2026: Section 6 (Glycemic Targets)',
          individualizedTargetApplied: hasCustomA1cTarget,
        };
      }

      // Prediabetes range (5.7% to 6.4%)
      if (numericValue >= ClinicalSafetyThresholds.HBA1C.PREDIABETES_MIN) {
        return {
          clinicalFlag: 'ELEVATED',
          isCritical: false,
          requiresEmergencyEscalation: false,
          clinicalCategory: 'HBA1C_PREDIABETES',
          clinicalMessage: `HbA1c (${numericValue}%) is in the prediabetes category (5.7%–6.4%).`,
          actionableGuidance: 'Structured lifestyle interventions (at least 150 minutes/week of moderate physical activity and balanced nutrition) are recommended to maintain healthy glycemic levels.',
          guidelineReference: 'ADA Standards of Care 2026: Section 2 (Classification & Diagnosis)',
          individualizedTargetApplied: false,
        };
      }

      // Normal reference range (< 5.7%)
      return {
        clinicalFlag: 'NORMAL',
        isCritical: false,
        requiresEmergencyEscalation: false,
        clinicalCategory: 'HBA1C_NORMAL',
        clinicalMessage: `Normal HbA1c value (${numericValue}%).`,
        actionableGuidance: 'Value is within the standard non-diabetic reference range (<5.7%).',
        guidelineReference: 'ADA Standards of Care 2026: Section 2 (Classification & Diagnosis)',
        individualizedTargetApplied: false,
      };
    }

    case 'WEIGHT':
    default: {
      return {
        clinicalFlag: 'NORMAL',
        isCritical: false,
        requiresEmergencyEscalation: false,
        clinicalCategory: 'WEIGHT_LOGGED',
        clinicalMessage: `${upperType} reading logged successfully (${numericValue} ${input.unit || 'kg'}).`,
        actionableGuidance: 'Consistent self-monitoring supports metabolic trend tracking over time.',
        guidelineReference: 'ADA Standards of Care 2026: Section 5 (Facilitating Positive Health Behaviors)',
        individualizedTargetApplied: false,
      };
    }
  }
}
