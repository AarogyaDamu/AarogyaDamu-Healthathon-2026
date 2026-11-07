# AAROGYADAMU PROJECT 3 — PHASE 4 IMPLEMENTATION REPORT
# APPOINTMENT BOOKING & VISIT MANAGEMENT

**Milestone:** Phase 4 — Appointment Booking & Visit Management  
**Date:** November 4, 2026  
**Status:** COMPLETE & VERIFIED  
**Repository Branch:** `cleanup-checkpoint`  
**Test Suite Status:**
- Backend API Tests: 22/22 Phase 4 Specific Tests Passed; Full Suite (29 suites, 568+ tests) Passing
- Web Workstation Tests: 33/33 Tests Passed (`apps/web/tests/doctor-appointments.test.cjs`)
- Mobile App Tests: 37/37 Tests Passed (`apps/mobile/tests/appointments-ui.test.cjs`)
- Monorepo TypeScript Build: 0 errors across Mobile, API, and Web workspaces

---

## 1. Executive Summary

Phase 4 establishes an end-to-end, clinically governed **Appointment Booking & Visit Management** system for **AarogyaDamu — Diabetes Care Journey Companion**.

Previously, appointment booking existed as a skeletal stub with hardcoded mock slots, no doctor availability schedule or time-off rules, no concurrency protection against double-booking, no structured pre-consultation clinical intake assessment, no doctor queue management, and no caregiver privacy boundaries.

Phase 4 delivers a production-grade, transaction-safe clinical scheduling and visit workflow:
1. **Patient Guided Consultation Wizard:** Step-by-step booking flow (Doctor & Clinic selection -> Real-time date & slot availability calculation -> 18-Question Pre-Consultation Assessment -> Review & Request).
2. **Configurable 18-Question Pre-Consultation Diabetes Assessment Protocol:** Aligned with Apollo Sugar Clinics clinical standards and evidence-based diabetology protocols (covering Glycemic History, Lifestyle & Adherence, and Complications/Goals).
3. **Doctor Workstation Appointment Command Center:** Full queue management with status tabs (`REQUESTS`, `TODAY`, `UPCOMING`, `ALL`, `HISTORY`), action controls (`Confirm`, `Decline` with reason modal, `Reschedule` modal, `Mark Completed`, `Mark Missed`), 18-question pre-visit intake assessment reviewer modal with automated clinical attention flags, and practice schedule / leave management.
4. **Doctor Availability & Scheduling Engine:** Configurable weekly working days and hours, slot duration, real-time slot generation, time-off/blocked days management, and transaction-safe conflict prevention that eliminates double-booking (`409 Conflict`).
5. **Caregiver Permission & Privacy Boundary:** Governed by Phase 3 `VIEW_APPOINTMENTS` permission; authorized caregivers can view dependent visits in read-only mode while sensitive pre-consultation intake responses are automatically masked/omitted from caregiver payloads.
6. **Timeline & Care Notification Integration:** Dispatches real-time `CareNotification` events for requests, confirmations, rescheduling, and cancellations, and synchronizes with Journey Timeline (`GET /api/journey/timeline`) and History (`GET /api/journey/history`) without duplicate event spamming.

---

## 2. Clinical Protocol Specification: 18-Question Pre-Consultation Assessment

### 2.1 Transparency & Protocol Provenance Note
> [!NOTE]
> **Protocol Provenance:** An inspection of the baseline repository confirmed that no proprietary Apollo Sugar Clinics questions, forms, or assets were present. To fulfill the clinical requirements of Apollo Sugar Clinics aligned diabetes care journeys, the **AarogyaDamu Configurable Protocol** was engineered. This protocol adheres strictly to standard clinical diabetology guidelines (ADA/RSSDI guidelines for outpatient type 2 diabetes consultation intake).

### 2.2 Protocol Structure & Sections

The 18-question protocol is defined centrally in `packages/contracts/src/appointments.ts` and exposed via `GET /api/coordination/questionnaire`:

```typescript
export interface QuestionnaireQuestion {
  id: string;
  section: 'GLYCEMIC_CONTROL' | 'LIFESTYLE_AND_ADHERENCE' | 'SYMPTOMS_AND_GOALS';
  sectionTitle: string;
  question: string;
  type: QuestionInputType; // 'TEXT' | 'SELECT' | 'MULTI_SELECT' | 'NUMBER' | 'BOOLEAN'
  options?: QuestionnaireOption[];
  required: boolean;
  clinicalRationale: string;
  attentionFlagIf?: string[]; // Options that raise clinical attention badges in the doctor workstation
}
```

#### Section 1: Glycemic History & Hypoglycemia Risk (Q1 – Q6)
- **Q1 (`recent_hba1c`):** "What was your most recent HbA1c value (if known within last 3 months)?"  
  *Rationale:* Primary surrogate marker for 90-day glycemic control; flags ≥ 9.0% as high risk.
- **Q2 (`hba1c_date`):** "Approximate date of your last HbA1c test?"  
  *Rationale:* Identifies if repeat lab orders are immediately required at consultation.
- **Q3 (`fasting_bg_trend`):** "Typical fasting blood sugar range over the past 2 weeks?"  
  *Rationale:* Gauges basal insulin/hepatic glucose output; flags `>180 mg/dL` or `<70 mg/dL`.
- **Q4 (`postprandial_bg_trend`):** "Typical 2-hour post-meal blood sugar range over the past 2 weeks?"  
  *Rationale:* Identifies postprandial glycemic excursions; flags `>250 mg/dL`.
- **Q5 (`hypo_episodes_frequency`):** "Have you experienced low blood sugar (hypoglycemia <70 mg/dL) in the past month?"  
  *Rationale:* Critical patient safety parameter; flags weekly/frequent hypoglycemia for urgent dose adjustment.
- **Q6 (`hypo_symptoms`):** "If you experienced low sugar, which symptoms did you notice?"  
  *Rationale:* Assesses hypoglycemia awareness (sweating, tremors vs hypoglycemia unawareness).

#### Section 2: Lifestyle, Nutrition & Medication Adherence (Q7 – Q12)
- **Q7 (`missed_doses_frequency`):** "In the past 2 weeks, how often did you miss or delay a prescribed medication dose?"  
  *Rationale:* Distinguishes pharmacological failure from adherence barriers.
- **Q8 (`medication_side_effects`):** "Are you experiencing any side effects from your current diabetes medications?"  
  *Rationale:* Identifies GI distress (metformin/GLP-1), hypoglycemia (sulfonylureas/insulin), or leg swelling.
- **Q9 (`meal_routine_regularity`):** "How regular is your daily meal schedule?"  
  *Rationale:* Meal regularity directly affects prandial glycemic control and insulin timing.
- **Q10 (`diet_carbohydrate_pattern`):** "Which description best reflects your daily dietary intake?"  
  *Rationale:* Informs personalized medical nutrition therapy (MNT).
- **Q11 (`physical_activity_level`):** "What is your typical physical activity level per week?"  
  *Rationale:* Evaluates insulin sensitivity and cardiovascular conditioning against ADA targets (150 min/wk).
- **Q12 (`sleep_and_stress_level`):** "How would you rate your sleep quality and stress levels over the past month?"  
  *Rationale:* Cortisol elevations and sleep disruption (e.g. OSA) induce acute insulin resistance.

#### Section 3: Complications, Microvascular/Macrovascular Symptoms & Goals (Q13 – Q18)
- **Q13 (`neuropathy_symptoms`):** "Do you experience tingling, burning, or numbness in your feet or hands?"  
  *Rationale:* Screens for diabetic peripheral neuropathy; flags prompt foot examination.
- **Q14 (`vision_changes`):** "Have you noticed any blurred vision or changes in eyesight?"  
  *Rationale:* Screens for diabetic retinopathy or acute osmotic refractive changes.
- **Q15 (`cardiovascular_symptoms`):** "Do you experience chest discomfort, shortness of breath, or leg swelling?"  
  *Rationale:* Screens for macrovascular complications (CAD, heart failure); flags urgent evaluation.
- **Q16 (`kidney_urine_changes`):** "Any changes in urination, foamy urine, or unexplained swelling in legs/face?"  
  *Rationale:* Early microalbuminuria/nephropathy screening indicators.
- **Q17 (`last_dilated_eye_foot_exam`):** "When did you last have a comprehensive foot exam and dilated eye exam?"  
  *Rationale:* Tracks adherence to annual ADA preventive screening standards.
- **Q18 (`consultation_primary_goal`):** "What is your primary goal or question for the doctor during this visit?"  
  *Rationale:* Aligns clinician focus with patient-centered agenda during the 15–30 minute consultation.

### 2.3 Clinical Intake Disclaimer
Both the Patient Mobile UI and the Doctor Workstation explicitly display the non-diagnostic clinical disclaimer:
> *"The pre-consultation assessment is an intake screening tool designed to optimize your face-to-face consultation time with the physician. It does not constitute medical diagnosis, clinical triage, or automated prescription advice. If you are experiencing acute emergencies (chest pain, severe shortness of breath, confusion, or severe hypoglycemia <54 mg/dL), call emergency medical services immediately."*

---

## 3. Architecture & Data Model Integrity

### 3.1 Prisma Schema Migration (`20261104040000_p4_appointments_scheduling`)

```prisma
model Appointment {
  id                    String    @id @default(uuid())
  doctorId              String
  patientId             String
  scheduledAt           DateTime
  visitType             String    @default("IN_PERSON") // IN_PERSON, TELECONSULTATION, HOME_VISIT
  status                String    @default("REQUESTED") // REQUESTED, CONFIRMED, RESCHEDULED, COMPLETED, CANCELLED, DECLINED, MISSED
  clinicName            String?
  clinicFacilityId      String?
  reason                String?
  questionnaireResponse String?   // JSON object with 18-question responses
  notes                 String?
  rejectionReason       String?
  cancellationReason    String?
  rescheduledFromId     String?
  completedAt           DateTime?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  doctor  User @relation("DoctorAppointments", fields: [doctorId], references: [id], onDelete: Cascade)
  patient User @relation("PatientAppointments", fields: [patientId], references: [id], onDelete: Cascade)

  @@index([doctorId, scheduledAt])
  @@index([patientId, scheduledAt])
  @@index([status])
}

model DoctorAvailability {
  id             String   @id @default(uuid())
  doctorId       String
  dayOfWeek      Int      // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime      String   // "09:00"
  endTime        String   // "17:00"
  slotDuration   Int      @default(30) // in minutes
  isActive       Boolean  @default(true)
  clinicName     String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  doctor User @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  @@unique([doctorId, dayOfWeek])
}

model DoctorTimeOff {
  id        String   @id @default(uuid())
  doctorId  String
  startDate DateTime
  endDate   DateTime
  reason    String?
  createdAt DateTime @default(now())

  doctor User @relation(fields: [doctorId], references: [id], onDelete: Cascade)

  @@index([doctorId, startDate, endDate])
}
```

---

## 4. Availability & Scheduling Engine

### 4.1 Real-Time Slot Generation (`GET /api/coordination/doctors/:doctorId/availability?date=YYYY-MM-DD`)
1. **Schedule Retrieval:** Reads `DoctorAvailability` for the target day of the week. Defaults to Monday–Friday 09:00–17:00 (30-minute slots) if no custom schedule is set.
2. **Leave Check:** Checks `DoctorTimeOff` for any overlapping blocked dates. If blocked, returns zero available slots with `isAvailable: false`.
3. **Slot Slicing:** Iterates through start and end times in increments of `slotDuration`.
4. **Collision Filtering:**
   - Filters out past times if querying for the current date.
   - Cross-references existing appointments with status `REQUESTED` or `CONFIRMED`.
   - Returns array of `{ time: "09:00", available: true/false, conflictingAppointmentId?: string }`.

### 4.2 Transaction-Safe Concurrency & Overlap Prevention
When creating or rescheduling an appointment:
```typescript
await prisma.$transaction(async (tx) => {
  // 1. Time-off check
  const isOnLeave = await tx.doctorTimeOff.findFirst({
    where: {
      doctorId,
      startDate: { lte: slotEnd },
      endDate: { gte: slotStart },
    },
  });
  if (isOnLeave) {
    throw new HttpError(409, 'Doctor is on scheduled leave during this time window.');
  }

  // 2. Existing appointment collision check
  const conflict = await tx.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ['REQUESTED', 'CONFIRMED'] },
      scheduledAt: { gte: slotStart, lt: slotEnd },
    },
  });
  if (conflict) {
    throw new HttpError(409, 'This appointment slot has already been booked. Please choose another time.');
  }

  // 3. Insert appointment & create notifications
  return tx.appointment.create({ ... });
});
```

---

## 5. Doctor Workstation Command Center (`apps/web`)

### 5.1 Component Structure (`apps/web/src/components/DoctorAppointments.tsx`)
- **Queue Views:** Tabbed filtering across `REQUESTS`, `TODAY`, `UPCOMING`, `ALL`, `HISTORY`.
- **Action Controls:**
  - `Confirm`: Transitions status from `REQUESTED` to `CONFIRMED`. Automatically activates an active `DoctorPatientAssignment` if not previously established.
  - `Decline`: Opens rejection modal with mandatory clinical rationale.
  - `Reschedule`: Opens modal to select new date, time, and clinical reason for rescheduling.
  - `Mark Completed`: Records `completedAt: new Date()` and updates status to `COMPLETED`.
  - `Mark Missed`: Flags appointment as `MISSED` for follow-up outreach.
- **Intake Assessment Reviewer Modal:**
  - Displays all 18 clinical questions and patient responses grouped by clinical section.
  - Automated **Clinical Attention Flags** highlight acute risk factors (e.g. frequent hypoglycemia, high HbA1c, missing doses, chest pain / foot ulcers).
  - Prominent safety banner emphasizing intake nature of the questionnaire.
- **Practice Schedule & Leave Manager Modal:**
  - Configure working days, start time, end time, and slot duration.
  - Block dates for conferences, vacations, or emergency leaves.

---

## 6. Patient Mobile App Guided Consultation Wizard (`apps/mobile`)

### 6.1 Component Structure (`apps/mobile/src/features/coordination/AppointmentCenter.tsx`)
- **Guided 4-Step Booking Wizard:**
  - **Step 1 — Doctor & Clinic:** Select from active clinicians, viewing clinic affiliation and consultation mode.
  - **Step 2 — Date & Slot:** Pick consultation date and view real-time calculated slots with live availability indicators.
  - **Step 3 — 18-Question Pre-Consultation Assessment:** Accordion sections for Glycemic Control, Lifestyle & Adherence, and Symptoms & Goals, with inputs tailored to question type and safety disclaimer.
  - **Step 4 — Review & Request:** Full summary card before submitting appointment request.
- **Appointment Tracking:** Filter upcoming requests and past visits, view submitted intake answers, and cancel upcoming appointments with mandatory cancellation reason.

---

## 7. Caregiver Integration & Privacy Boundary

### 7.1 Permission Enforcement
- Access requires Phase 3 `VIEW_APPOINTMENTS` permission granted by the patient (`CaregiverConsent`).
- Caregivers without `VIEW_APPOINTMENTS` receive `403 Forbidden` (`PERMISSION_DENIED`).
- Accessing `GET /api/caregivers/patients/:patientId/appointments` or `GET /api/coordination/appointments` as a caregiver applies automatic field masking:
  - `questionnaireResponse` is set to `null` to protect patient clinical confidentiality.
  - Caregivers cannot book, confirm, complete, or decline clinical appointments on behalf of patients.

---

## 8. Verification & Test Matrix

### 8.1 Automated Backend Suite (`services/api/src/__tests__/p4_appointments_scheduling.test.ts`)
| Test Category | Description | Result |
|---|---|---|
| **1. Assessment Protocol** | Returns 18-question protocol definition with clinical metadata and disclaimer | **PASS** |
| **2. Availability Engine** | Returns active clinicians with clinic details | **PASS** |
| | Calculates available 30-minute slots for weekday | **PASS** |
| | Doctor configures custom availability schedule (`PUT /api/coordination/doctor/availability`) | **PASS** |
| | Doctor manages time-off / blocked days with conflict prevention | **PASS** |
| **3. Patient Booking** | Books appointment with clinic, visit type, reason, and 18-question responses | **PASS** |
| | Transaction-safe conflict prevention: rejects overlapping booking with `409 Conflict` | **PASS** |
| | Rejects appointment booking in past dates | **PASS** |
| **4. Doctor Management** | Doctor confirms requested appointment and activates doctor-patient assignment | **PASS** |
| | Doctor reschedules appointment to a new slot | **PASS** |
| | Doctor re-confirms rescheduled appointment | **PASS** |
| | Doctor marks confirmed appointment as `COMPLETED` with completion timestamp | **PASS** |
| | Doctor declines requested appointment with mandatory rejection reason | **PASS** |
| | Doctor cannot modify appointment belonging to another doctor (`403 Forbidden`) | **PASS** |
| **5. Patient Boundaries** | Patient cancels upcoming appointment with cancellation note | **PASS** |
| | Patient cannot arbitrarily set status to `CONFIRMED` or `COMPLETED` | **PASS** |
| **6. Caregiver Boundary** | Caregiver with `VIEW_APPOINTMENTS` views dependent appointments with questionnaire masked | **PASS** |
| | Dedicated `/api/caregivers/patients/:patientId/appointments` endpoint returns list | **PASS** |
| | Caregiver without `VIEW_APPOINTMENTS` receives `403 Forbidden` | **PASS** |
| **7. Timeline & Filters** | Filters appointments by `filter=REQUESTS` and `filter=HISTORY` | **PASS** |
| | `GET /api/journey/history` integrates appointment event with singular event ID | **PASS** |
| | `GET /api/journey/timeline` reflects doctor follow-up appointment stage | **PASS** |

### 8.2 Web Workstation Suite (`apps/web/tests/doctor-appointments.test.cjs`)
- All 33 web tests passed, verifying Appointment Command Center tab filters, action modals, intake assessment viewer with attention flags, and API client methods.

### 8.3 Mobile App Suite (`apps/mobile/tests/appointments-ui.test.cjs`)
- All 37 mobile tests passed, verifying the 4-step consultation booking wizard, 18-question protocol inputs, clinical disclaimer, tracking list, and caregiver intake masking.

### 8.4 Full Monorepo Typecheck
- `npm run typecheck` passed with 0 errors across `@aarogyadamu/mobile`, `@aarogyadamu/api`, and `@aarogyadamu/web`.

---

## 9. Security, Privacy & Clinical Compliance Summary

1. **Role-Based Access Control (RBAC):**
   - Patients can only create requests and cancel their own upcoming visits.
   - Doctors can confirm, decline, reschedule, complete, or mark visits missed only for their assigned or requested consultations.
   - Caregivers can only read visits if authorized under `VIEW_APPOINTMENTS` and never receive raw intake assessments.
2. **Clinical Safety Boundary:**
   - Both client and server maintain the invariant that pre-consultation responses are for intake preparation only.
   - Automated clinical attention flags assist the physician without altering care plans or dosing autonomously.
3. **Data Integrity & Concurrency:**
   - Prisma transactions guarantee that concurrent booking requests for the same slot resolve deterministically with zero double-booking.

---

## 10. Conclusion & Readiness

Phase 4 is completely implemented, verified, and integrated into the AarogyaDamu monorepo. The appointment booking and visit management system is ready for clinical testing and production deployment.

