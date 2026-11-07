import { z } from 'zod';

export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'RESCHEDULED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'MISSED';

export type VisitType =
  | 'CHECKUP'
  | 'FOLLOW_UP'
  | 'DIABETES_REVIEW'
  | 'EMERGENCY'
  | 'OTHER';

export type QuestionInputType =
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'TEXT'
  | 'NUMBER';

export interface QuestionnaireOption {
  value: string;
  label: string;
  isClinicalFlag?: boolean;
}

export interface QuestionnaireQuestion {
  id: string;
  sectionNumber: 1 | 2 | 3;
  sectionTitle: string;
  order: number;
  title: string;
  subtitle?: string;
  inputType: QuestionInputType;
  options?: QuestionnaireOption[];
  required: boolean;
  placeholder?: string;
  clinicalRationale: string;
}

/**
 * Configurable Pre-Consultation Diabetes Assessment Questionnaire (AarogyaDamu Pre-Visit Protocol)
 * Designed in alignment with Apollo Sugar Clinics clinical intake protocols.
 * NOTE: Screening intake answers are for clinical consultation preparation only and DO NOT constitute a medical diagnosis.
 */
const LEGACY_PRE_VISIT_QUESTIONNAIRE_QUESTIONS: QuestionnaireQuestion[] = [
  // SECTION 1: DIABETES & GLYCEMIC HISTORY (Q1 - Q6)
  {
    id: 'primary_concern',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 1,
    title: 'What is the primary reason for your consultation today?',
    subtitle: 'Describe current concerns, recent changes, or goals for this visit.',
    inputType: 'TEXT',
    required: true,
    placeholder: 'e.g., Routine HbA1c review, recent high fasting numbers, medication adjustment...',
    clinicalRationale: 'Establishes chief complaint and clinician prioritization.',
  },
  {
    id: 'diabetes_type',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 2,
    title: 'What type of diabetes have you been diagnosed with?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'TYPE_2', label: 'Type 2 Diabetes Mellitus' },
      { value: 'TYPE_1', label: 'Type 1 Diabetes Mellitus' },
      { value: 'GESTATIONAL', label: 'Gestational Diabetes' },
      { value: 'PRE_DIABETES', label: 'Pre-Diabetes / Impaired Glucose Tolerance' },
      { value: 'NOT_SURE', label: 'Not Sure / Newly Diagnosed' },
    ],
    required: true,
    clinicalRationale: 'Fundamental diagnostic classification.',
  },
  {
    id: 'diagnosis_duration',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 3,
    title: 'How long have you lived with diabetes?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'LESS_THAN_6M', label: 'Newly diagnosed (< 6 months)' },
      { value: '6M_TO_2Y', label: '6 months to 2 years' },
      { value: '2Y_TO_5Y', label: '2 to 5 years' },
      { value: '5Y_TO_10Y', label: '5 to 10 years' },
      { value: 'MORE_THAN_10Y', label: 'More than 10 years' },
    ],
    required: true,
    clinicalRationale: 'Disease chronicity indicates risk profile for micro/macrovascular complications.',
  },
  {
    id: 'recent_fasting_sugar',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 4,
    title: 'What was your most recent fasting blood glucose reading (mg/dL)?',
    subtitle: 'Enter numeric value measured before breakfast, or leave blank if unknown.',
    inputType: 'NUMBER',
    required: false,
    placeholder: 'e.g. 126',
    clinicalRationale: 'Basal glycemic control indicator.',
  },
  {
    id: 'recent_post_meal_sugar',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 5,
    title: 'What was your most recent post-meal (PP) blood glucose reading (mg/dL)?',
    subtitle: 'Measured 2 hours after a meal.',
    inputType: 'NUMBER',
    required: false,
    placeholder: 'e.g. 165',
    clinicalRationale: 'Postprandial glycemic spike evaluation.',
  },
  {
    id: 'last_hba1c_level',
    sectionNumber: 1,
    sectionTitle: 'Diabetes & Glycemic History',
    order: 6,
    title: 'What was your last known HbA1c test result?',
    subtitle: 'HbA1c reflects 3-month average blood glucose.',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'BELOW_6_5', label: 'Optimal (< 6.5%)' },
      { value: '6_5_TO_7_0', label: 'Controlled (6.5% – 7.0%)' },
      { value: '7_1_TO_8_0', label: 'Moderately Elevated (7.1% – 8.0%)' },
      { value: '8_1_TO_9_0', label: 'Poorly Controlled (8.1% – 9.0%)' },
      { value: 'ABOVE_9_0', label: 'Critically High (> 9.0%)', isClinicalFlag: true },
      { value: 'NOT_TESTED_RECENTLY', label: 'Not tested in the last 6 months' },
    ],
    required: true,
    clinicalRationale: 'Gold standard glycemic control biomarker.',
  },

  // SECTION 2: TREATMENT, ADHERENCE & HYPOGLYCEMIA SAFETY (Q7 - Q12)
  {
    id: 'current_treatment_types',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 7,
    title: 'What diabetes treatments are you currently taking?',
    subtitle: 'Select all therapies that apply to your daily routine.',
    inputType: 'MULTI_SELECT',
    options: [
      { value: 'ORAL_METFORMIN', label: 'Metformin' },
      { value: 'ORAL_SULFONYLUREA', label: 'Glimepiride / Gliclazide' },
      { value: 'ORAL_SGLT2', label: 'Dapagliflozin / Empagliflozin' },
      { value: 'ORAL_DPP4', label: 'Sitagliptin / Vildagliptin / Teneligliptin' },
      { value: 'INSULIN_BASAL', label: 'Once-daily Long-Acting Insulin (Glargine / Degludec)' },
      { value: 'INSULIN_PRANDIAL', label: 'Mealtime Rapid-Acting Insulin' },
      { value: 'LIFESTYLE_ONLY', label: 'Diet & Exercise alone (No medication)' },
      { value: 'OTHER', label: 'Other / Ayurvedic / Herbal supplements' },
    ],
    required: true,
    clinicalRationale: 'Establishes therapeutic category and insulin-dependency.',
  },
  {
    id: 'hypoglycemia_frequency',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 8,
    title: 'Have you had low blood sugar episodes (< 70 mg/dL) in the past month?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'NEVER', label: 'Never in the past month' },
      { value: 'ONCE_TWICE', label: 'Once or twice' },
      { value: 'WEEKLY', label: 'About once a week', isClinicalFlag: true },
      { value: 'MULTIPLE_WEEKLY', label: 'Multiple times per week (Frequent)', isClinicalFlag: true },
    ],
    required: true,
    clinicalRationale: 'Critical safety indicator for overtreatment and sulfonylurea/insulin risk.',
  },
  {
    id: 'hypoglycemia_symptoms',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 9,
    title: 'When your sugar drops low, which symptoms do you typically experience?',
    subtitle: 'Select all symptoms experienced during hypoglycemic episodes.',
    inputType: 'MULTI_SELECT',
    options: [
      { value: 'TREMORS_SHAKINESS', label: 'Shakiness or trembling hands' },
      { value: 'SWEATING', label: 'Cold sweats / Clamminess' },
      { value: 'DIZZINESS', label: 'Dizziness or lightheadedness' },
      { value: 'RAPID_HEARTBEAT', label: 'Fast heartbeat / Palpitations' },
      { value: 'EXTREME_HUNGER', label: 'Sudden intense hunger' },
      { value: 'CONFUSION', label: 'Confusion or difficulty speaking' },
      { value: 'UNAWARENESS', label: 'No symptoms (Hypoglycemia Unawareness)', isClinicalFlag: true },
      { value: 'NONE', label: 'No low blood sugar episodes' },
    ],
    required: false,
    clinicalRationale: 'Assesses autonomic counter-regulatory response and unawareness risk.',
  },
  {
    id: 'medication_adherence_frequency',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 10,
    title: 'How consistently are you able to take your prescribed medicines?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'ALWAYS', label: 'Every day without missing doses' },
      { value: 'MISS_OCCASIONALLY', label: 'Miss 1–2 doses per week' },
      { value: 'MISS_FREQUENTLY', label: 'Miss several doses a week', isClinicalFlag: true },
      { value: 'IRREGULAR', label: 'Frequently forget or stop due to side effects', isClinicalFlag: true },
    ],
    required: true,
    clinicalRationale: 'Identifies barriers to therapeutic concordance.',
  },
  {
    id: 'daily_meal_pattern',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 11,
    title: 'Which best describes your daily dietary pattern?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'STRUCTURED_DIABETIC', label: 'Consistent diabetic meal plan (Portion-controlled)' },
      { value: 'TRADITIONAL_HOME', label: 'Traditional home-cooked Indian meals' },
      { value: 'FREQUENT_OUTSIDE', label: 'Frequent restaurant, fried, or processed food' },
      { value: 'IRREGULAR_TIMINGS', label: 'Irregular meal timings / Skip meals' },
    ],
    required: true,
    clinicalRationale: 'Nutritional stability directly modulates insulin/medication requirements.',
  },
  {
    id: 'weekly_exercise_days',
    sectionNumber: 2,
    sectionTitle: 'Treatment & Safety',
    order: 12,
    title: 'How many days per week do you do 30+ minutes of brisk walking or exercise?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'ZERO', label: '0 days (Sedentary lifestyle)' },
      { value: '1_TO_2_DAYS', label: '1 to 2 days per week' },
      { value: '3_TO_4_DAYS', label: '3 to 4 days per week' },
      { value: '5_PLUS_DAYS', label: '5 or more days per week (Active)' },
    ],
    required: true,
    clinicalRationale: 'Evaluates peripheral insulin sensitivity through physical conditioning.',
  },

  // SECTION 3: SYMPTOMS, COMPLICATIONS & GOALS (Q13 - Q18)
  {
    id: 'vision_changes',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 13,
    title: 'Have you noticed any blurred vision, floaters, or rapid eye changes?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'NO', label: 'No vision issues' },
      { value: 'SOMETIMES', label: 'Intermittent blurriness after meals' },
      { value: 'YES_PERSISTENT', label: 'Yes, persistent blurriness or vision decline', isClinicalFlag: true },
    ],
    required: true,
    clinicalRationale: 'Diabetic retinopathy screening trigger.',
  },
  {
    id: 'foot_symptoms',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 14,
    title: 'Do you experience any numbness, tingling, or cuts on your feet?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'NONE', label: 'No symptoms, normal sensation' },
      { value: 'TINGLING', label: 'Pins and needles or mild tingling' },
      { value: 'BURNING_NUMBNESS', label: 'Burning sensation or loss of feeling (Numbness)', isClinicalFlag: true },
      { value: 'ACTIVE_WOUND', label: 'Active foot ulcer, slow-healing wound, or corn', isClinicalFlag: true },
    ],
    required: true,
    clinicalRationale: 'Diabetic peripheral neuropathy and diabetic foot ulcer risk.',
  },
  {
    id: 'blood_pressure_status',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 15,
    title: 'Do you have high blood pressure (Hypertension)?',
    inputType: 'SINGLE_SELECT',
    options: [
      { value: 'NO', label: 'No, blood pressure is normal' },
      { value: 'YES_CONTROLLED', label: 'Yes, taking BP medication and well controlled' },
      { value: 'YES_UNCONTROLLED', label: 'Yes, but readings often exceed 140/90', isClinicalFlag: true },
      { value: 'NOT_SURE', label: 'Not sure / Not checked recently' },
    ],
    required: true,
    clinicalRationale: 'Cardiovascular comorbidity assessment in diabetes.',
  },
  {
    id: 'cardio_renal_history',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 16,
    title: 'Have you been diagnosed with any heart, kidney, or lipid conditions?',
    subtitle: 'Select all documented medical conditions.',
    inputType: 'MULTI_SELECT',
    options: [
      { value: 'HEART_DISEASE', label: 'Coronary artery disease / Heart attack / Stent' },
      { value: 'KIDNEY_DISEASE', label: 'Kidney disease / Protein in urine (Microalbuminuria)' },
      { value: 'HIGH_CHOLESTEROL', label: 'High cholesterol / Dyslipidemia' },
      { value: 'FATTY_LIVER', label: 'Fatty Liver (NAFLD/MASLD)' },
      { value: 'NONE', label: 'None of the above' },
    ],
    required: false,
    clinicalRationale: 'Macrovascular and microvascular organ impairment profiling.',
  },
  {
    id: 'known_drug_allergies',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 17,
    title: 'Do you have any known allergies to medicines, foods, or substances?',
    inputType: 'TEXT',
    required: false,
    placeholder: 'e.g. Penicillin, Sulfa drugs, Aspirin, or None',
    clinicalRationale: 'Crucial pharmacovigilance safety check prior to prescribing.',
  },
  {
    id: 'patient_consultation_goals',
    sectionNumber: 3,
    sectionTitle: 'Symptoms & Consultation Goals',
    order: 18,
    title: 'What specific questions or outcomes would you like Dr. to prioritize today?',
    subtitle: 'List your top questions so the doctor can address them directly.',
    inputType: 'TEXT',
    required: false,
    placeholder: 'e.g. How to prevent evening sugar drops, review my diet chart, reduce medications...',
    clinicalRationale: 'Patient-centered consultation agenda setting.',
  },
];

void LEGACY_PRE_VISIT_QUESTIONNAIRE_QUESTIONS;

const makeIntakeQuestion = (
  id: string,
  order: number,
  title: string,
  inputType: QuestionInputType,
  options?: QuestionnaireOption[],
  placeholder?: string
): QuestionnaireQuestion => ({
  id,
  sectionNumber: order <= 6 ? 1 : order <= 12 ? 2 : 3,
  sectionTitle: 'Questionnaires',
  order,
  title,
  inputType,
  options,
  required: false,
  placeholder,
  clinicalRationale: 'Patient-reported response for clinician review.',
});

const yesNoOptions: QuestionnaireOption[] = [
  { value: 'YES', label: 'YES' },
  { value: 'NO', label: 'NO' },
];

export const PRE_VISIT_QUESTIONNAIRE_QUESTIONS: QuestionnaireQuestion[] = [
  makeIntakeQuestion('known_diabetes', 1, 'Are you a known case of diabetes? (YES / NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('diagnosis_duration', 2, 'If yes, when were you first diagnosed with diabetes? ______ MONTHS/YEARS.', 'TEXT', undefined, 'Months or years'),
  makeIntakeQuestion('detection_method', 3, 'How was your diabetes first detected? (ROUTINE CHECK-UP / SYMPTOMS / HOSPITAL ADMISSION / DURING PREGNANCY).', 'SINGLE_SELECT', [
    { value: 'ROUTINE_CHECKUP', label: 'ROUTINE CHECK-UP' },
    { value: 'SYMPTOMS', label: 'SYMPTOMS' },
    { value: 'HOSPITAL_ADMISSION', label: 'HOSPITAL ADMISSION' },
    { value: 'DURING_PREGNANCY', label: 'DURING PREGNANCY' },
  ]),
  makeIntakeQuestion('medication_adherence', 4, 'Do you take your diabetes medications regularly? (YES/NO)', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('current_diabetes_medications', 5, 'What medications are you currently taking for diabetes?', 'TEXT', undefined, '1. ______  2. ______  3. ______  4. ______'),
  makeIntakeQuestion('recent_glucose_results', 6, 'What was your recent fasting and PP result? ______ & ______', 'TEXT', undefined, 'Fasting result & PP result'),
  makeIntakeQuestion('hypoglycemia_episodes', 7, 'Have you had any episodes of low blood sugar? (SWEATING, TREMORS, DIZZINESS, CONFUSION). If yes, when and what time of the day? (YES/NO) ______', 'TEXT', undefined, 'YES/NO; if yes, when and time of day'),
  makeIntakeQuestion('thirst_or_urination', 8, 'Do you experience excessive thirst or frequent urination? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('weight_change', 9, 'Any changes in your weight recently? If yes, how much? (YES/NO) ______ KG', 'TEXT', undefined, 'YES/NO; if yes, amount in kg'),
  makeIntakeQuestion('vision_problems', 10, 'Have you noticed any problems with your vision? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('foot_sensations', 11, 'Do you have numbness, tingling, or burning sensation in your feet? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('foot_wounds', 12, 'Do you have any wounds, ulcers, or non-healing sores on your feet? If yes, where? (YES/NO).', 'TEXT', undefined, 'YES/NO; if yes, where?'),
  makeIntakeQuestion('urinary_symptoms', 13, 'Any history of burning while peeing or past history of recurrent UTI? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('kidney_or_leg_swelling', 14, 'Have you had any kidney problems or swelling of legs? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('heart_disease', 15, 'Have you ever had chest pain or been diagnosed with heart disease? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('breathlessness', 16, 'Do you get breathless while walking on level ground or climbing a flight of stairs? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
  makeIntakeQuestion('other_conditions_and_medications', 17, 'Do you have other conditions such as high blood pressure or high cholesterol? If yes, what medications are you currently taking? (YES/NO).', 'TEXT', undefined, 'YES/NO; if yes, list medications (1. ______  2. ______  3. ______)'),
  makeIntakeQuestion('diet_or_exercise_plan', 18, 'Do you follow a specific diet plan or exercise routine? (YES/NO).', 'SINGLE_SELECT', yesNoOptions),
];

export const questionnaireSubmissionSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
  completedAt: z.string().datetime(),
  version: z.string().default('1.0'),
  disclaimerAcknowledged: z.boolean().refine((val) => val === true, {
    message: 'Disclaimer must be acknowledged before submitting questionnaire.',
  }),
});

export type QuestionnaireSubmission = z.infer<typeof questionnaireSubmissionSchema>;
