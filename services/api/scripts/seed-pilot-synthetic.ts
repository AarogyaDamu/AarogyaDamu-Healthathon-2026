import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
import { runWithTenantContext, updateTenantContext } from '../src/db/tenantContext';
import { generateValidSyntheticPdfBuffer, savePrivateFile } from '../src/services/storageService';

export const PILOT_PASSWORDS = {
  DOCTOR: process.env.PILOT_DOCTOR_PASSWORD || 'PilotDoctor2026!',
  RECEPTIONIST: process.env.PILOT_RECEPTIONIST_PASSWORD || 'PilotReceptionist2026!',
  NURSE: process.env.PILOT_NURSE_PASSWORD || 'PilotNurse2026!',
  CAREGIVER: process.env.PILOT_CAREGIVER_PASSWORD || 'PilotCaregiver2026!',
  PATIENT: process.env.PILOT_PATIENT_PASSWORD || 'PilotPatient2026!',
};

const LEGACY_DEMO_PASSWORDS = new Set([
  'PilotDoctor2026!',
  'PilotReceptionist2026!',
  'PilotNurse2026!',
  'PilotCaregiver2026!',
  'PilotPatient2026!',
  'DemoPassword123!',
]);

function assertRotatedPilotPasswordsIfDeployed(): void {
  const isDeployed = env.NODE_ENV === 'production' || env.APP_ENV !== 'development';
  if (!isDeployed) return;

  const requiredVars: Array<[string, string | undefined]> = [
    ['PILOT_DOCTOR_PASSWORD', process.env.PILOT_DOCTOR_PASSWORD],
    ['PILOT_RECEPTIONIST_PASSWORD', process.env.PILOT_RECEPTIONIST_PASSWORD],
    ['PILOT_NURSE_PASSWORD', process.env.PILOT_NURSE_PASSWORD],
    ['PILOT_CAREGIVER_PASSWORD', process.env.PILOT_CAREGIVER_PASSWORD],
    ['PILOT_PATIENT_PASSWORD', process.env.PILOT_PATIENT_PASSWORD],
  ];

  for (const [envName, val] of requiredVars) {
    if (!val || val.trim().length < 12 || LEGACY_DEMO_PASSWORDS.has(val.trim())) {
      throw new Error(
        `STRICT SECURITY HALT: ${envName} must be explicitly configured with a rotated password (>= 12 chars, never a default demo password) before seeding ${env.APP_ENV}.`
      );
    }
  }
}

export async function seedPilotSyntheticDataset() {
  return runWithTenantContext({ isSystemWorker: true, workerScope: 'DEMO_WORKER' }, async () => {
  console.log('================================================================');
  console.log('  AarogyaDamu Phase 10: Synthetic Pilot Dataset Bootstrap');
  console.log('================================================================\n');

  // Safety invariant: require explicit confirmation before seeding production with synthetic data
  const allowSyntheticSeed =
    process.argv.includes('--confirm-synthetic-seed') ||
    process.env.ALLOW_SYNTHETIC_DEMO_SEED === 'true';
  if (env.APP_ENV === 'production' && !allowSyntheticSeed) {
    throw new Error(
      'STRICT SAFETY HALT: Synthetic pilot seed in production requires ALLOW_SYNTHETIC_DEMO_SEED=true or --confirm-synthetic-seed.'
    );
  }

  assertRotatedPilotPasswordsIfDeployed();

  const doctorPasswordHash = await bcrypt.hash(PILOT_PASSWORDS.DOCTOR, 10);
  const receptionistPasswordHash = await bcrypt.hash(PILOT_PASSWORDS.RECEPTIONIST, 10);
  const nursePasswordHash = await bcrypt.hash(PILOT_PASSWORDS.NURSE, 10);
  const caregiverPasswordHash = await bcrypt.hash(PILOT_PASSWORDS.CAREGIVER, 10);
  const patientPasswordHash = await bcrypt.hash(PILOT_PASSWORDS.PATIENT, 10);

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. PRACTICE SEEDING
  console.log('1. Setting up Practice: AarogyaDamu Diabetes Care & Research Center...');
  let practice = await prisma.practice.findFirst({
    where: { name: 'AarogyaDamu Diabetes Care & Research Center' },
  });

  if (!practice) {
    practice = await prisma.practice.create({
      data: {
        name: 'AarogyaDamu Diabetes Care & Research Center',
        slug: 'aarogyadamu-diabetes-care-pilot',
        registrationNumber: 'KMC-2016-78219',
        council: 'Karnataka Medical Council',
        specialty: 'Diabetology & Endocrinology',
        qualifications: 'MBBS, MD (Medicine), DM (Endocrinology)',
        consultationFeeInr: 700,
        phone: '9845012345',
        address: 'Suite 302, Richmond Circle',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560025',
        workingDays: 'MON,TUE,WED,THU,FRI,SAT',
      },
    });
  } else {
    practice = await prisma.practice.update({
      where: { id: practice.id },
      data: {
        registrationNumber: 'KMC-2016-78219',
        council: 'Karnataka Medical Council',
        specialty: 'Diabetology & Endocrinology',
        qualifications: 'MBBS, MD (Medicine), DM (Endocrinology)',
        consultationFeeInr: 700,
        phone: '9845012345',
        address: 'Suite 302, Richmond Circle',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560025',
        workingDays: 'MON,TUE,WED,THU,FRI,SAT',
      },
    });
  }

  updateTenantContext({ practiceId: practice.id });

  // 2. CLINICIAN (OWNER DOCTOR)
  console.log('2. Bootstrapping Lead Clinician: Dr. Rupam...');
  const doctorEmail = 'dr.rupam.pilot@aarogyadamu.local';
  const doctor = await prisma.user.upsert({
    where: { email: doctorEmail },
    update: {
      passwordHash: doctorPasswordHash,
      isClinician: true,
      isSyntheticDemo: true,
      isActive: true,
    },
    create: {
      email: doctorEmail,
      passwordHash: doctorPasswordHash,
      isClinician: true,
      isSyntheticDemo: true,
      isActive: true,
      profile: {
        create: {
          fullName: 'Dr. Rupam',
          diabetesType: 'NONE',
          primaryClinician: 'Self',
          timeZone: 'Asia/Kolkata',
          preferredLanguage: 'en',
        },
      },
    },
    include: { profile: true },
  });

  // Ensure Doctor Practice Membership
  await prisma.practiceMembership.upsert({
    where: {
      practiceId_userId: {
        practiceId: practice.id,
        userId: doctor.id,
      },
    },
    update: { role: 'OWNER', isActive: true },
    create: {
      practiceId: practice.id,
      userId: doctor.id,
      role: 'OWNER',
      isActive: true,
    },
  });

  updateTenantContext({ userId: doctor.id, practiceId: practice.id, role: 'DOCTOR' });

  // 3. RECEPTIONIST
  console.log('3. Bootstrapping Receptionist: Sunita Rao...');
  const receptionistEmail = 'receptionist.pilot@aarogyadamu.local';
  const receptionist = await prisma.user.upsert({
    where: { email: receptionistEmail },
    update: {
      passwordHash: receptionistPasswordHash,
      isClinician: false,
      isSyntheticDemo: true,
      isActive: true,
    },
    create: {
      email: receptionistEmail,
      passwordHash: receptionistPasswordHash,
      isClinician: false,
      isSyntheticDemo: true,
      isActive: true,
      profile: {
        create: {
          fullName: 'Sunita Rao',
          diabetesType: 'NONE',
          timeZone: 'Asia/Kolkata',
          preferredLanguage: 'en',
        },
      },
    },
    include: { profile: true },
  });

  await prisma.practiceMembership.upsert({
    where: {
      practiceId_userId: {
        practiceId: practice.id,
        userId: receptionist.id,
      },
    },
    update: { role: 'RECEPTIONIST', isActive: true },
    create: {
      practiceId: practice.id,
      userId: receptionist.id,
      role: 'RECEPTIONIST',
      isActive: true,
    },
  });

  // 3b. NURSE & DIABETES EDUCATOR
  console.log('3b. Bootstrapping Clinic Nurse: Sister Priya Sharma...');
  const nurseEmail = 'nurse.priya.pilot@aarogyadamu.local';
  const nurse = await prisma.user.upsert({
    where: { email: nurseEmail },
    update: {
      passwordHash: nursePasswordHash,
      isClinician: true,
      isSyntheticDemo: true,
      isActive: true,
    },
    create: {
      email: nurseEmail,
      passwordHash: nursePasswordHash,
      isClinician: true,
      isSyntheticDemo: true,
      isActive: true,
      profile: {
        create: {
          fullName: 'Sister Priya Sharma',
          diabetesType: 'NONE',
          timeZone: 'Asia/Kolkata',
          preferredLanguage: 'en',
        },
      },
    },
    include: { profile: true },
  });

  await prisma.practiceMembership.upsert({
    where: {
      practiceId_userId: {
        practiceId: practice.id,
        userId: nurse.id,
      },
    },
    update: { role: 'STAFF', isActive: true },
    create: {
      practiceId: practice.id,
      userId: nurse.id,
      role: 'STAFF',
      isActive: true,
    },
  });

  // 4. CAREGIVER
  console.log('4. Bootstrapping Caregiver: Rohit Kulkarni...');
  const caregiverEmail = 'caregiver.pilot@aarogyadamu.local';
  const caregiver = await prisma.user.upsert({
    where: { email: caregiverEmail },
    update: {
      passwordHash: caregiverPasswordHash,
      isClinician: false,
      isSyntheticDemo: true,
      isActive: true,
    },
    create: {
      email: caregiverEmail,
      passwordHash: caregiverPasswordHash,
      isClinician: false,
      isSyntheticDemo: true,
      isActive: true,
      profile: {
        create: {
          fullName: 'Rohit Kulkarni',
          diabetesType: 'NONE',
          timeZone: 'Asia/Kolkata',
          preferredLanguage: 'en',
        },
      },
    },
    include: { profile: true },
  });

  // 5. CONSULTATION TEMPLATES (Standard Indian Diabetology Defaults)
  console.log('5. Bootstrapping Practice Consultation Templates...');
  const templates = [
    {
      name: 'Type 2 Diabetes Routine Follow-up',
      specialty: 'Diabetology',
      chiefComplaint: 'Quarterly routine review; evaluation of self-monitored blood glucose (SMBG).',
      defaultDiagnosesJson: JSON.stringify([
        { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' },
      ]),
      defaultPrescriptionsJson: JSON.stringify([
        { medicationName: 'Metformin Hydrochloride', dosage: '500 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 90, instructions: 'Take with or immediately after meals.' },
      ]),
      defaultLabOrdersJson: JSON.stringify(['HbA1c', 'Lipid Profile', 'Serum Creatinine', 'Urine Microalbumin/Creatinine Ratio']),
      defaultLifestyleAdvice: 'Maintain 30 mins moderate aerobic activity daily. Emphasize low glycemic index diet with balanced whole grains and vegetables.',
    },
    {
      name: 'Uncontrolled Diabetes & Glycemic Escalation',
      specialty: 'Diabetology & Endocrinology',
      chiefComplaint: 'Suboptimal glycemic control; elevated post-prandial excursions; symptomatic fatigue.',
      defaultDiagnosesJson: JSON.stringify([
        { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia', category: 'CONFIRMED' },
        { code: 'I10', display: 'Essential primary hypertension', category: 'CONFIRMED' },
      ]),
      defaultPrescriptionsJson: JSON.stringify([
        { medicationName: 'Metformin Hydrochloride (Glucophage)', dosage: '1000 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 60, instructions: 'Take with breakfast and dinner.' },
        { medicationName: 'Glimepiride (Amaryl)', dosage: '2 mg', frequency: '1-0-0', timing: 'BEFORE_FOOD', durationDays: 60, instructions: 'Take 15 minutes before breakfast.' },
      ]),
      defaultLabOrdersJson: JSON.stringify(['HbA1c', 'Fasting & Post-Prandial Blood Sugar', 'Complete Renal Function Panel']),
      defaultLifestyleAdvice: 'Rigid carbohydrate portion control. Eliminate sugary beverages, monitor pre-dinner and bedtime glucose readings.',
    },
    {
      name: 'Diabetic Nephropathy & Cardiorenal Screening',
      specialty: 'Diabetology & Nephrology',
      chiefComplaint: 'Annual microvascular screening; persistent microalbuminuria; blood pressure monitoring.',
      defaultDiagnosesJson: JSON.stringify([
        { code: 'E11.22', display: 'Type 2 diabetes mellitus with diabetic chronic kidney disease', category: 'CONFIRMED' },
        { code: 'N18.2', display: 'Chronic kidney disease, stage 2 (mild)', category: 'CONFIRMED' },
      ]),
      defaultPrescriptionsJson: JSON.stringify([
        { medicationName: 'Empagliflozin (Jardiance)', dosage: '10 mg', frequency: '1-0-0', timing: 'AFTER_FOOD', durationDays: 90, instructions: 'Take in morning with water. Maintain liberal hydration.' },
        { medicationName: 'Telmisartan (Telma)', dosage: '40 mg', frequency: '0-0-1', timing: 'BEDTIME', durationDays: 90, instructions: 'Take at night. Periodic potassium monitoring.' },
      ]),
      defaultLabOrdersJson: JSON.stringify(['eGFR', 'Serum Electrolytes', 'Spot Urine Microalbumin-to-Creatinine Ratio (ACR)']),
      defaultLifestyleAdvice: 'Sodium restriction (<2g/day). Avoid nephrotoxic medications (NSAIDs). Hydration maintenance.',
    },
  ];

  for (const t of templates) {
    const existingT = await prisma.consultationTemplate.findFirst({
      where: { practiceId: practice.id, name: t.name },
    });
    if (!existingT) {
      await prisma.consultationTemplate.create({
        data: {
          practiceId: practice.id,
          doctorId: doctor.id,
          ...t,
        },
      });
    }
  }

  // 6. FIVE SYNTHETIC DIABETES PATIENTS
  console.log('6. Bootstrapping 5 Realistic Synthetic Diabetes Patients...');
  const patientConfigs = [
    {
      email: 'ramesh.t2d@aarogyadamu.local',
      fullName: 'Ramesh Patel',
      age: 52,
      gender: 'Male',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2021,
      knownAllergies: 'Sulfa drugs (rash)',
      targetFastingMin: 80,
      targetFastingMax: 130,
      targetPostMealMax: 160,
      persona: 'Early Type 2 Diabetes — Diet controlled + Metformin 500mg BD. Highly motivated, compliant.',
      planTitle: 'Early Type 2 Glycemic Optimization',
      planSummary: 'Target HbA1c < 6.8%. Lifestyle modification with twice-daily Metformin 500mg.',
      medications: [
        {
          name: 'Metformin Hydrochloride (Glucophage)',
          dosage: '500 mg',
          frequency: '1-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Take with breakfast and dinner with water.',
        },
      ],
      baselineObservations: {
        fbsRange: [112, 126],
        ppbsRange: [145, 168],
        bpSystolicRange: [120, 128],
        bpDiastolicRange: [78, 84],
        hba1c: 6.8,
        weight: 74.5,
      },
      consultation: {
        chiefComplaint: 'Quarterly routine review; morning fasting sugars averaging 118 mg/dL.',
        hpi: 'Known T2D for 4 years. Compliant with Metformin 500mg BD. Walks 30 mins daily. No hypoglycemic episodes, polyuria or vision changes.',
        exam: { bpSystolic: 124, bpDiastolic: 80, pulseRate: 72, weightKg: 74.5, randomBloodSugar: 138, generalExam: 'Alert, oriented, vitals stable, no pedal edema.', footExam: 'Normal sensations, monofilament intact bilaterally, dorsalis pedis pulses palpable.' },
        diagnoses: [{ code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' }],
        prescriptions: [{ medicationName: 'Metformin Hydrochloride (Glucophage)', dosage: '500 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 90, instructions: 'Continue 500mg twice daily with meals.' }],
        labOrders: ['HbA1c', 'Lipid Profile', 'Urine Microalbumin/Creatinine Ratio'],
        lifestyleAdvice: 'Continue 30-min brisk walk. Emphasize whole-grain intake and avoid refined carbohydrates.',
        receiptNumber: 'REC-202611-0001',
        paymentMethod: 'UPI',
        transactionRef: 'UPI/2026/001-RP',
      },
    },
    {
      email: 'meenakshi.uncontrolled@aarogyadamu.local',
      fullName: 'Meenakshi Sundaram',
      age: 58,
      gender: 'Female',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2017,
      knownAllergies: 'None documented',
      targetFastingMin: 90,
      targetFastingMax: 140,
      targetPostMealMax: 180,
      persona: 'Uncontrolled Type 2 Diabetes — Erratic dietary habits, skipped doses, high post-prandial glycemic excursions.',
      planTitle: 'Intensive Glycemic Stabilization & Lifestyle Intervention',
      planSummary: 'Target HbA1c < 7.5%. Escalated dual oral therapy with structured dietary coaching.',
      medications: [
        {
          name: 'Metformin Hydrochloride (Glucophage)',
          dosage: '1000 mg',
          frequency: '1-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Take after meals. Do not skip breakfast or dinner.',
        },
        {
          name: 'Glimepiride (Amaryl)',
          dosage: '2 mg',
          frequency: '1-0-0',
          timing: 'BEFORE_FOOD',
          instructions: 'Take 15 minutes before breakfast without fail.',
        },
      ],
      baselineObservations: {
        fbsRange: [160, 195],
        ppbsRange: [225, 275],
        bpSystolicRange: [134, 144],
        bpDiastolicRange: [84, 92],
        hba1c: 8.9,
        weight: 81.2,
      },
      consultation: {
        chiefComplaint: 'Post-prandial lethargy, afternoon fatigue, and elevated home glucometer readings (>230 mg/dL).',
        hpi: 'T2D for 9 years. Reports erratic business travel, occasional skipped dinner doses, and frequent evening carb-heavy snacks. Complains of mild blurred vision during spikes.',
        exam: { bpSystolic: 138, bpDiastolic: 88, pulseRate: 78, weightKg: 81.2, randomBloodSugar: 242, generalExam: 'Slightly tired, no acute distress, mild acanthosis nigricans on neck.', footExam: 'Intact bilateral sensation, peripheral pulses good, skin dry.' },
        diagnoses: [
          { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia', category: 'CONFIRMED' },
          { code: 'I10', display: 'Essential primary hypertension', category: 'CONFIRMED' },
        ],
        prescriptions: [
          { medicationName: 'Metformin Hydrochloride (Glucophage)', dosage: '1000 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 60, instructions: 'Increase to 1000mg twice daily with meals.' },
          { medicationName: 'Glimepiride (Amaryl)', dosage: '2 mg', frequency: '1-0-0', timing: 'BEFORE_FOOD', durationDays: 60, instructions: '2mg daily before breakfast. Keep glucose biscuits handy.' },
        ],
        labOrders: ['HbA1c', 'Complete Lipid Profile', 'Dilated Retinal Examination', 'Serum Creatinine'],
        lifestyleAdvice: 'Strict portion control. Zero fruit juices or sweetened chai. 20-min brisk walk after dinner.',
        receiptNumber: 'REC-202611-0002',
        paymentMethod: 'CASH',
        transactionRef: 'CASH-REC-002-MS',
      },
    },
    {
      email: 'anand.elderly@aarogyadamu.local',
      fullName: 'Anand Kulkarni',
      age: 71,
      gender: 'Male',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2012,
      knownAllergies: 'Aspirin (triggers severe gastritis)',
      targetFastingMin: 95,
      targetFastingMax: 145,
      targetPostMealMax: 190,
      persona: 'Elderly Type 2 Diabetes with Caregiver Support — Risk of hypoglycemia unawareness, managed cooperatively with son Rohit.',
      planTitle: 'Geriatric Glycemic Safety & Hypoglycemia Prevention',
      planSummary: 'Individualized HbA1c target < 7.5% to avoid dangerous hypoglycemia. Monitored by caregiver Rohit Kulkarni.',
      medications: [
        {
          name: 'Vildagliptin (Galvus)',
          dosage: '50 mg',
          frequency: '1-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Take morning and evening after food. DPP-4i with minimal hypoglycemia risk.',
        },
        {
          name: 'Metformin Hydrochloride',
          dosage: '500 mg',
          frequency: '1-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Take with food.',
        },
      ],
      baselineObservations: {
        fbsRange: [102, 132],
        ppbsRange: [150, 185],
        bpSystolicRange: [128, 136],
        bpDiastolicRange: [74, 82],
        hba1c: 7.2,
        weight: 68.0,
      },
      consultation: {
        chiefComplaint: 'Follow-up for hypoglycemia monitoring; son reports occasional pre-lunch shakiness.',
        hpi: '71yo gentleman with longstanding T2D (14 yrs). Accompanied by son Rohit. Glucometer logged occasional dips to 72 mg/dL when lunch is delayed. No falls, syncope, or nocturnal sweating.',
        exam: { bpSystolic: 132, bpDiastolic: 78, pulseRate: 70, weightKg: 68.0, randomBloodSugar: 146, generalExam: 'Elderly, pleasant, coherent, gait steady.', footExam: 'Mild vibration sense reduction at great toes, monofilament 8/10 bilaterally, no calluses or ulcers.' },
        diagnoses: [
          { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' },
        ],
        prescriptions: [
          { medicationName: 'Vildagliptin (Galvus)', dosage: '50 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 90, instructions: '50mg twice daily with meals. Low risk of hypoglycemia.' },
          { medicationName: 'Metformin Hydrochloride', dosage: '500 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 90, instructions: '500mg twice daily with meals.' },
        ],
        labOrders: ['HbA1c', 'Electrolytes & Creatinine', 'Annual Vitamin B12'],
        lifestyleAdvice: 'Never delay lunch past 1:00 PM. Keep glucometer and glucose chews on bedside table. Caregiver to assist with morning logs.',
        receiptNumber: 'REC-202611-0003',
        paymentMethod: 'CARD',
        transactionRef: 'POS-HDFC-9182-AK',
      },
    },
    {
      email: 'farooq.nephropathy@aarogyadamu.local',
      fullName: 'Mohammed Farooq',
      age: 61,
      gender: 'Male',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2014,
      knownAllergies: 'ACE inhibitors (intractable dry cough)',
      targetFastingMin: 90,
      targetFastingMax: 135,
      targetPostMealMax: 175,
      persona: 'Diabetic Nephropathy & Cardiorenal Protection — Microalbuminuria (ACR 85 mg/g), Stage 2 CKD (eGFR 68 mL/min), SGLT2i + ARB therapy.',
      planTitle: 'Cardiorenal Metabolic Protection & Albuminuria Management',
      planSummary: 'Slow renal progression. Maintain strict BP < 130/80 and HbA1c ~ 7.5%. Cardioprotective SGLT2 inhibitor regimen.',
      medications: [
        {
          name: 'Empagliflozin (Jardiance)',
          dosage: '10 mg',
          frequency: '1-0-0',
          timing: 'AFTER_FOOD',
          instructions: 'Take in the morning. Drink at least 2.5 liters of water daily.',
        },
        {
          name: 'Telmisartan (Telma)',
          dosage: '40 mg',
          frequency: '0-0-1',
          timing: 'BEDTIME',
          instructions: 'Take at night. ARB for nephroprotection.',
        },
        {
          name: 'Metformin Hydrochloride',
          dosage: '500 mg',
          frequency: '1-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Dose adjusted for renal safety (eGFR > 60).',
        },
      ],
      baselineObservations: {
        fbsRange: [134, 152],
        ppbsRange: [178, 212],
        bpSystolicRange: [132, 140],
        bpDiastolicRange: [80, 86],
        hba1c: 7.9,
        weight: 86.4,
      },
      consultation: {
        chiefComplaint: 'Cardiorenal review; review of repeat spot urine ACR and renal panel.',
        hpi: 'Known T2D for 12 years with persistent microalbuminuria (baseline ACR 110 mg/g). Switched from Ramipril (cough) to Telmisartan 40mg. Tolerating Empagliflozin well without urinary symptoms.',
        exam: { bpSystolic: 134, bpDiastolic: 82, pulseRate: 74, weightKg: 86.4, randomBloodSugar: 172, generalExam: 'Well-groomed, oriented, trace pedal edema over shins, no pallor.', footExam: 'Intact sensation, pulses palpable, skin intact.' },
        diagnoses: [
          { code: 'E11.22', display: 'Type 2 diabetes mellitus with diabetic chronic kidney disease', category: 'CONFIRMED' },
          { code: 'N18.2', display: 'Chronic kidney disease, stage 2 (mild)', category: 'CONFIRMED' },
          { code: 'I10', display: 'Essential primary hypertension', category: 'CONFIRMED' },
        ],
        prescriptions: [
          { medicationName: 'Empagliflozin (Jardiance)', dosage: '10 mg', frequency: '1-0-0', timing: 'AFTER_FOOD', durationDays: 90, instructions: 'Continue 10mg morning. Ensure hydration.' },
          { medicationName: 'Telmisartan (Telma)', dosage: '40 mg', frequency: '0-0-1', timing: 'BEDTIME', durationDays: 90, instructions: 'Continue 40mg bedtime.' },
          { medicationName: 'Metformin Hydrochloride', dosage: '500 mg', frequency: '1-0-1', timing: 'AFTER_FOOD', durationDays: 90, instructions: '500mg twice daily with meals.' },
        ],
        labOrders: ['Urine Microalbumin/Creatinine Ratio (ACR)', 'Serum Creatinine & eGFR', 'Serum Potassium', 'HbA1c'],
        lifestyleAdvice: 'Low-sodium diet (< 2000 mg/day). Avoid all over-the-counter painkillers (Brufen/Voveran). Report any flank pain or burning micturition immediately.',
        receiptNumber: 'REC-202611-0004',
        paymentMethod: 'UPI',
        transactionRef: 'UPI/2026/004-MF',
      },
    },
    {
      email: 'ananya.newlydiagnosed@aarogyadamu.local',
      fullName: 'Ananya Sen',
      age: 36,
      gender: 'Female',
      diabetesType: 'TYPE_2',
      diagnosisYear: 2026,
      knownAllergies: 'None documented',
      targetFastingMin: 75,
      targetFastingMax: 115,
      targetPostMealMax: 140,
      persona: 'Newly Diagnosed Type 2 Diabetes — Young professional, diagnosed during executive corporate health screening. High health literacy, anxious, candidate for diabetes remission.',
      planTitle: 'New-Onset Diabetes Education, Nutritional Coaching & Remission Trial',
      planSummary: 'Aggressive lifestyle intervention + low-dose Metformin ER. Target HbA1c < 6.0% and potential drug-free remission within 6-12 months.',
      medications: [
        {
          name: 'Metformin Hydrochloride Extended Release (Glycomet-SR)',
          dosage: '500 mg',
          frequency: '0-0-1',
          timing: 'AFTER_FOOD',
          instructions: 'Take 1 tablet after dinner. Swallow whole, do not crush.',
        },
      ],
      baselineObservations: {
        fbsRange: [136, 156],
        ppbsRange: [188, 224],
        bpSystolicRange: [114, 122],
        bpDiastolicRange: [72, 78],
        hba1c: 7.6,
        weight: 65.2,
      },
      consultation: {
        chiefComplaint: 'Executive health check showed elevated fasting glucose (152 mg/dL) and HbA1c 7.6%. Asymptomatic.',
        hpi: '36yo IT project lead. No prior medical history. Maternal history of T2D. Reports sedentary desk job, high stress, late dinners. Very anxious about diabetes stigma and lifelong medication dependency.',
        exam: { bpSystolic: 118, bpDiastolic: 76, pulseRate: 76, weightKg: 65.2, randomBloodSugar: 184, generalExam: 'Young woman in no acute distress, mildly anxious, normal BMI (23.8).', footExam: 'Completely normal bilateral sensations, brisk pulses, warm extremities.' },
        diagnoses: [
          { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' },
        ],
        prescriptions: [
          { medicationName: 'Metformin Hydrochloride Extended Release (Glycomet-SR)', dosage: '500 mg', frequency: '0-0-1', timing: 'AFTER_FOOD', durationDays: 60, instructions: 'Start with 500mg ER once daily with dinner.' },
        ],
        labOrders: ['Repeat HbA1c in 90 days', 'Fasting C-Peptide & Anti-GAD Antibodies (to rule out LADA)', 'Lipid Profile', 'Thyroid Stimulating Hormone (TSH)'],
        lifestyleAdvice: 'Intensive lifestyle coaching: 45 mins daily aerobic exercise (jogging/swimming/badminton). Reassurance that early T2D can enter prolonged remission with weight and metabolic control.',
        receiptNumber: 'REC-202611-0005',
        paymentMethod: 'UPI',
        transactionRef: 'UPI/2026/005-AS',
      },
    },
  ];

  let patientIndex = 0;
  for (const cfg of patientConfigs) {
    patientIndex++;
    console.log(`\n  [Patient ${patientIndex}/5]: Seeding ${cfg.fullName} (${cfg.email})...`);

    // A. Upsert User & Profile
    const patientUser = await prisma.user.upsert({
      where: { email: cfg.email },
      update: {
        passwordHash: patientPasswordHash,
        isClinician: false,
        isSyntheticDemo: true,
        isActive: true,
      },
      create: {
        email: cfg.email,
        passwordHash: patientPasswordHash,
        isClinician: false,
        isSyntheticDemo: true,
        isActive: true,
        profile: {
          create: {
            fullName: cfg.fullName,
            diabetesType: cfg.diabetesType,
            diagnosisYear: cfg.diagnosisYear,
            primaryClinician: 'Dr. Rupam',
            knownAllergies: cfg.knownAllergies,
            targetFastingMin: cfg.targetFastingMin,
            targetFastingMax: cfg.targetFastingMax,
            targetPostMealMax: cfg.targetPostMealMax,
            timeZone: 'Asia/Kolkata',
            preferredLanguage: 'en',
          },
        },
      },
      include: { profile: true },
    });

    const patientId = patientUser.id;
    updateTenantContext({ userId: doctor.id, practiceId: practice.id, patientId, role: 'DOCTOR' });

    // B. Link Doctor <-> Patient Assignment
    await prisma.doctorPatientAssignment.upsert({
      where: {
        doctorId_patientId: {
          doctorId: doctor.id,
          patientId,
        },
      },
      update: { status: 'ACTIVE', activatedAt: new Date(now.getTime() - 90 * dayMs) },
      create: {
        doctorId: doctor.id,
        patientId,
        status: 'ACTIVE',
        activatedAt: new Date(now.getTime() - 90 * dayMs),
      },
    });

    // B2. Link Multidisciplinary Care Team (Nurse Priya Sharma)
    const existingNurseTeamMember = await prisma.patientCareTeamMember.findFirst({
      where: { patientId, userId: nurse.id },
    });
    if (!existingNurseTeamMember) {
      await prisma.patientCareTeamMember.create({
        data: {
          patientId,
          userId: nurse.id,
          role: 'NURSE',
          practiceId: practice.id,
          assignedById: doctor.id,
          status: 'ACTIVE',
        },
      });
    }

    // C. Caregiver Consent (for Patient 3: Anand Kulkarni)
    if (cfg.email === 'anand.elderly@aarogyadamu.local') {
      console.log('    - Attaching authorized caregiver Rohit Kulkarni...');
      const canonicalCaregiverPermissions = [
        'VIEW_OBSERVATIONS',
        'VIEW_HEALTH_SUMMARY',
        'MANAGE_OBSERVATIONS',
        'VIEW_TASKS',
        'MANAGE_TASKS',
        'COMPLETE_TASKS_ON_BEHALF',
        'VIEW_DOCUMENTS',
        'VIEW_REPORTS',
        'VIEW_CONSULTATIONS',
        'VIEW_APPOINTMENTS',
        'MANAGE_CONSULTATIONS',
        'VIEW_CARE_PLAN',
        'VIEW_HEALTH_TIMELINE',
        'VIEW_MEDICATIONS',
        'VIEW_MEDICATION_ADHERENCE',
        'LOG_ADHERENCE',
        'VIEW_LIFESTYLE',
        'MANAGE_LIFESTYLE',
        'VIEW_NOTIFICATIONS',
        'VIEW_REMINDERS',
        'MANAGE_REMINDERS',
        'VIEW_EMERGENCY',
        'MANAGE_EMERGENCY',
        'RECEIVE_ALERTS',
        'LOG_ON_BEHALF',
      ];
      await runWithTenantContext({ userId: patientId, role: 'PATIENT' }, async () => {
        const existingConsent = await prisma.caregiverConsent.findFirst({
          where: { patientId, caregiverEmail: caregiver.email },
        });
        if (!existingConsent) {
          await prisma.caregiverConsent.create({
            data: {
              patientId,
              caregiverEmail: caregiver.email,
              caregiverName: 'Rohit Kulkarni',
              relationship: 'SON',
              status: 'ACTIVE',
              permissions: JSON.stringify(canonicalCaregiverPermissions),
              acceptedAt: new Date(now.getTime() - 60 * dayMs),
            },
          });
        } else {
          await prisma.caregiverConsent.update({
            where: { id: existingConsent.id },
            data: {
              status: 'ACTIVE',
              permissions: JSON.stringify(canonicalCaregiverPermissions),
            },
          });
        }
      });
      updateTenantContext({ userId: doctor.id, practiceId: practice.id, patientId, role: 'DOCTOR' });
    }

    // D. Care Plan & Goals
    console.log(`    - Seeding Care Plan: ${cfg.planTitle}...`);
    let carePlan = await prisma.carePlan.findFirst({
      where: { patientId, title: cfg.planTitle },
    });
    if (!carePlan) {
      carePlan = await prisma.carePlan.create({
        data: {
          patientId,
          doctorId: doctor.id,
          approvedById: doctor.id,
          title: cfg.planTitle,
          diagnosis: 'Type 2 Diabetes Mellitus',
          status: 'ACTIVE',
          version: 1,
          summary: cfg.planSummary,
          doctorInstructions: cfg.persona,
          approvedAt: new Date(now.getTime() - 30 * dayMs),
          reviewDate: new Date(now.getTime() + 60 * dayMs),
        },
      });
    }

    // E. Care Tasks
    await prisma.careTask.deleteMany({ where: { userId: patientId } });
    await prisma.careTask.createMany({
      data: [
        {
          userId: patientId,
          carePlanId: carePlan.id,
          assignedById: doctor.id,
          title: 'Daily Morning Fasting Blood Glucose Log',
          category: 'HEALTH_LOGGING',
          priority: 'HIGH',
          frequency: 'DAILY',
          status: 'PENDING',
          dueAt: new Date(now.getTime() + 1 * dayMs),
          instructions: 'Check blood glucose before breakfast. Target: ' + cfg.targetFastingMin + '-' + cfg.targetFastingMax + ' mg/dL.',
        },
        {
          userId: patientId,
          carePlanId: carePlan.id,
          assignedById: doctor.id,
          title: 'Post-Meal 2hr Blood Glucose Monitoring',
          category: 'HEALTH_LOGGING',
          priority: 'MEDIUM',
          frequency: 'DAILY',
          status: 'PENDING',
          dueAt: new Date(now.getTime() + 1 * dayMs + 2 * 60 * 60 * 1000),
          instructions: 'Measure 2 hours after largest meal of the day. Target < ' + cfg.targetPostMealMax + ' mg/dL.',
        },
        {
          userId: patientId,
          carePlanId: carePlan.id,
          assignedById: doctor.id,
          title: 'Quarterly HbA1c Laboratory Evaluation',
          category: 'LAB_TEST',
          priority: 'HIGH',
          frequency: 'ONCE',
          status: 'PENDING',
          dueAt: new Date(now.getTime() + 45 * dayMs),
          instructions: 'Visit authorized diagnostic lab with fasting sample.',
        },
      ],
    });

    // F. Medication Schedule (Med Vault)
    const existingMeds = await prisma.medicationSchedule.findMany({ where: { userId: patientId } });
    if (existingMeds.length === 0) {
      for (const med of cfg.medications) {
        await prisma.medicationSchedule.create({
          data: {
            userId: patientId,
            medicineName: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            timing: med.timing,
            instructions: med.instructions,
            status: 'ACTIVE',
            reviewStatus: 'APPROVED',
            startDate: new Date(now.getTime() - 60 * dayMs),
            isActive: true,
          },
        });
      }
    }

    // G. Longitudinal Observations (30 to 60 days of clinical readings)
    console.log('    - Generating longitudinal health observations (glucose, BP, HbA1c, weight)...');
    await prisma.healthObservation.deleteMany({ where: { userId: patientId } });

    const observationsToInsert: any[] = [];
    const numDays = 45;
    for (let d = numDays; d >= 0; d--) {
      const obsDate = new Date(now.getTime() - d * dayMs);

      // Fasting glucose (morning ~07:30)
      const fbsVariance = (Math.random() - 0.5) * (cfg.baselineObservations.fbsRange[1] - cfg.baselineObservations.fbsRange[0]);
      const fbsVal = Math.round((cfg.baselineObservations.fbsRange[0] + cfg.baselineObservations.fbsRange[1]) / 2 + fbsVariance);
      const fbsDate = new Date(obsDate);
      fbsDate.setHours(7, 30, 0, 0);

      observationsToInsert.push({
        userId: patientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: fbsVal,
        unit: 'mg/dL',
        context: 'FASTING',
        clinicalFlag: fbsVal > cfg.targetFastingMax ? 'HIGH' : fbsVal < cfg.targetFastingMin ? 'LOW' : 'NORMAL',
        provenance: 'PATIENT_ENTERED',
        sourceProvenance: 'MANUAL_PATIENT',
        observedAt: fbsDate,
      });

      // Post-meal glucose (afternoon ~14:00)
      const ppbsVariance = (Math.random() - 0.5) * (cfg.baselineObservations.ppbsRange[1] - cfg.baselineObservations.ppbsRange[0]);
      const ppbsVal = Math.round((cfg.baselineObservations.ppbsRange[0] + cfg.baselineObservations.ppbsRange[1]) / 2 + ppbsVariance);
      const ppbsDate = new Date(obsDate);
      ppbsDate.setHours(14, 0, 0, 0);

      observationsToInsert.push({
        userId: patientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: ppbsVal,
        unit: 'mg/dL',
        context: 'POST_MEAL_2HR',
        clinicalFlag: ppbsVal > cfg.targetPostMealMax ? 'HIGH' : 'NORMAL',
        provenance: 'PATIENT_ENTERED',
        sourceProvenance: 'MANUAL_PATIENT',
        observedAt: ppbsDate,
      });

      // Blood pressure every 3 days
      if (d % 3 === 0) {
        const bpDate = new Date(obsDate);
        bpDate.setHours(8, 0, 0, 0);
        const sysVal = Math.round((cfg.baselineObservations.bpSystolicRange[0] + cfg.baselineObservations.bpSystolicRange[1]) / 2 + (Math.random() - 0.5) * 6);
        const diaVal = Math.round((cfg.baselineObservations.bpDiastolicRange[0] + cfg.baselineObservations.bpDiastolicRange[1]) / 2 + (Math.random() - 0.5) * 4);

        observationsToInsert.push({
          userId: patientId,
          type: 'BLOOD_PRESSURE',
          numericValue: sysVal,
          secondaryValue: diaVal,
          unit: 'mmHg',
          context: 'RESTING',
          clinicalFlag: sysVal >= 140 || diaVal >= 90 ? 'HIGH' : 'NORMAL',
          provenance: 'PATIENT_ENTERED',
          sourceProvenance: 'MANUAL_PATIENT',
          observedAt: bpDate,
        });
      }
    }

    // Historical HbA1c
    observationsToInsert.push({
      userId: patientId,
      type: 'HBA1C',
      numericValue: cfg.baselineObservations.hba1c,
      unit: '%',
      context: 'LABORATORY',
      clinicalFlag: cfg.baselineObservations.hba1c >= 8.0 ? 'HIGH' : cfg.baselineObservations.hba1c >= 7.0 ? 'BORDERLINE' : 'NORMAL',
      provenance: 'DIAGNOSTIC_LAB',
      sourceProvenance: 'LAB_INTEGRATION',
      observedAt: new Date(now.getTime() - 15 * dayMs),
    });

    // Weight observation
    observationsToInsert.push({
      userId: patientId,
      type: 'WEIGHT',
      numericValue: cfg.baselineObservations.weight,
      unit: 'kg',
      context: 'RESTING',
      clinicalFlag: 'NORMAL',
      provenance: 'CLINICIAN_ENTERED',
      sourceProvenance: 'DOCTOR_CLINICAL',
      observedAt: new Date(now.getTime() - 2 * dayMs),
    });

    await prisma.healthObservation.createMany({ data: observationsToInsert });

    // H. Historical Completed Consultation & Encounter Billing
    console.log('    - Finalizing SOAP consultation note and encounter receipt...');
    const appointmentDate = new Date(now.getTime() - 5 * dayMs);
    appointmentDate.setHours(10, 30, 0, 0);

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: doctor.id,
        bookedById: patientId,
        scheduledAt: appointmentDate,
        durationMinutes: 30,
        reason: cfg.consultation.chiefComplaint,
        status: 'COMPLETED',
        completedAt: new Date(appointmentDate.getTime() + 30 * 60 * 1000),
        clinicName: practice.name,
      },
    });

    const structuredNoteMarkdown = `### CHIEF COMPLAINT & HISTORY
- **Chief Complaint:** ${cfg.consultation.chiefComplaint}
- **History of Present Illness:** ${cfg.consultation.hpi}

### OBJECTIVE EXAMINATION
- **Vitals:** BP ${cfg.consultation.exam.bpSystolic}/${cfg.consultation.exam.bpDiastolic} mmHg | Pulse ${cfg.consultation.exam.pulseRate} bpm | Weight ${cfg.consultation.exam.weightKg} kg | RBS ${cfg.consultation.exam.randomBloodSugar} mg/dL
- **General Examination:** ${cfg.consultation.exam.generalExam}
- **Foot Examination:** ${cfg.consultation.exam.footExam}

### ASSESSMENT & DIAGNOSIS
${cfg.consultation.diagnoses.map((d: any) => `- [${d.code}] ${d.display} (${d.category})`).join('\n')}

### TREATMENT PLAN & DIGITAL PRESCRIPTION
${cfg.consultation.prescriptions.map((rx: any) => `- **${rx.medicationName}** — ${rx.dosage} (${rx.frequency}, ${rx.timing}) x ${rx.durationDays} days. Note: ${rx.instructions}`).join('\n')}

### LAB INVESTIGATIONS ORDERED
${cfg.consultation.labOrders.map((l: any) => `- ${l}`).join('\n')}

### LIFESTYLE & DIETARY ADVICE
${cfg.consultation.lifestyleAdvice}

---
*Digitally documented and verified by Dr. Rupam, MBBS, MD, DM (Reg: KMC-2016-78219)*`;

    await runWithTenantContext(
      { userId: doctor.id, practiceId: practice.id, patientId, role: 'DOCTOR' },
      async () => {
        const note = await prisma.consultationNote.create({
          data: {
            userId: patientId,
            clinicianId: doctor.id,
            clinicianName: 'Dr. Rupam',
            appointmentId: appointment.id,
            status: 'DRAFT',
            structuredNote: structuredNoteMarkdown,
            clinicalDiagnosisJson: JSON.stringify(cfg.consultation.diagnoses),
            examinationFindingsJson: JSON.stringify(cfg.consultation.exam),
            labOrdersJson: JSON.stringify(cfg.consultation.labOrders),
            lifestyleAdvice: cfg.consultation.lifestyleAdvice,
            isManual: true,
          },
        });

        // Create prescription items linked to consultation note
        for (const rx of cfg.consultation.prescriptions) {
          await prisma.consultationPrescriptionItem.create({
            data: {
              consultationNoteId: note.id,
              medicationName: rx.medicationName,
              dosage: rx.dosage,
              frequency: rx.frequency,
              timing: rx.timing,
              durationDays: rx.durationDays,
              instructions: rx.instructions,
            },
          });
        }

        // Finalize note to APPROVED once prescriptions are attached
        await prisma.consultationNote.update({
          where: { id: note.id },
          data: {
            status: 'APPROVED',
            approvedNoteText: structuredNoteMarkdown,
            approvedAt: appointment.completedAt,
            approvedBy: 'Dr. Rupam',
            sharedWithPatient: true,
            sharedAt: appointment.completedAt,
          },
        });

        // Create Encounter Billing Record
        await prisma.patientEncounterBilling.deleteMany({
          where: { receiptNumber: cfg.consultation.receiptNumber },
        });
        await prisma.patientEncounterBilling.create({
          data: {
            practiceId: practice.id,
            patientId,
            doctorId: doctor.id,
            appointmentId: appointment.id,
            consultationFeeInr: 700,
            discountInr: 0,
            totalAmountInr: 700,
            paymentStatus: 'PAID',
            paymentMethod: cfg.consultation.paymentMethod,
            receiptNumber: cfg.consultation.receiptNumber,
            transactionReference: cfg.consultation.transactionRef,
            notes: `Encounter consultation billing for ${cfg.fullName}`,
          },
        });
      }
    );

    // I. Optional Upcoming Appointment for Patient 1 and Patient 2
    if (patientIndex <= 2) {
      if (patientIndex === 1) {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const existingElapsed = await prisma.appointment.findFirst({
          where: {
            patientId,
            doctorId: doctor.id,
            scheduledAt: { gte: startOfDay, lte: now },
            status: { in: ['CONFIRMED', 'MISSED'] },
          },
        });
        if (!existingElapsed) {
          const elapsedToday = new Date(now.getTime() - 2 * 60 * 60 * 1000);
          await prisma.appointment.create({
            data: {
              patientId,
              doctorId: doctor.id,
              bookedById: doctor.id,
              scheduledAt: elapsedToday,
              durationMinutes: 30,
              reason: 'Morning fasting blood glucose evaluation',
              status: 'CONFIRMED',
              clinicName: practice.name,
            },
          });
        }
      }

      const futureDate = new Date(now.getTime() + (patientIndex === 1 ? 14 : 21) * dayMs);
      futureDate.setHours(11, 0, 0, 0);
      const existingFuture = await prisma.appointment.findFirst({
        where: {
          patientId,
          doctorId: doctor.id,
          scheduledAt: { gte: now },
          status: 'CONFIRMED',
        },
      });
      if (!existingFuture) {
        await prisma.appointment.create({
          data: {
            patientId,
            doctorId: doctor.id,
            bookedById: doctor.id,
            scheduledAt: futureDate,
            durationMinutes: 30,
            reason: 'Routine quarterly glycemic check & HbA1c review',
            status: 'CONFIRMED',
            clinicName: practice.name,
          },
        });
      }
    }
  }

  const showCredentials = env.APP_ENV === 'development' && env.NODE_ENV !== 'production';
  console.log('\n================================================================');
  console.log('  SYNTHETIC PILOT DATASET SEEDED SUCCESSFULLY');
  console.log('================================================================');
  console.log('Practice: AarogyaDamu Diabetes Care & Research Center');
  console.log(`Doctor:        ${doctorEmail} (${showCredentials ? `Password: ${PILOT_PASSWORDS.DOCTOR}` : 'rotated env password applied'})`);
  console.log(`Receptionist:  ${receptionistEmail} (${showCredentials ? `Password: ${PILOT_PASSWORDS.RECEPTIONIST}` : 'rotated env password applied'})`);
  console.log(`Caregiver:     ${caregiverEmail} (${showCredentials ? `Password: ${PILOT_PASSWORDS.CAREGIVER}` : 'rotated env password applied'})`);
  console.log(`Patients (5):  (${showCredentials ? `Password for all patients: ${PILOT_PASSWORDS.PATIENT}` : 'rotated env password applied'})`);
  patientConfigs.forEach((p, idx) => {
    console.log(`   ${idx + 1}. ${p.fullName} <${p.email}> — ${p.persona.split('—')[0].trim()}`);
  });
  console.log('================================================================\n');

    return {
      success: true,
      practiceId: practice.id,
      doctorId: doctor.id,
      receptionistId: receptionist.id,
      caregiverId: caregiver.id,
    };
  });
}

async function main() {
  try {
    await seedPilotSyntheticDataset();
  } catch (err: any) {
    console.error('ERROR during synthetic pilot seeding:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
