# AarogyaDamu Clinical Safety Rules Specification
## Deterministic Decision Rules for Diabetes & Cardiovascular Metrics

**Document Version:** 1.0.0-P0.0.1  
**Status:** **PENDING_CLINICIAN_APPROVAL**  
**Source Guidelines:**  
1. American Diabetes Association (ADA) *Standards of Care in Diabetes—2026* (Diabetes Care 2026;49[Suppl. 1])  
2. ACC/AHA 2017 *Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults*  
**Effective Target Date:** November 2, 2026  
**Review Cycle:** Annual or upon updated guideline release  

> [!WARNING]
> **REGULATORY & MEDICAL DISCLAIMER:**  
> This document defines deterministic clinical decision logic implemented within the AarogyaDamu software platform. Automated software tests verify code execution against these defined thresholds, but **software testing does not constitute clinical validation**. These rules remain strictly designated as `PENDING_CLINICIAN_APPROVAL` until formal review, verification, and sign-off by a qualified licensed physician (Endocrinologist / Diabetologist).

---

## 1. Governance & Output Semantics

Every observation evaluated by the AarogyaDamu deterministic evaluator emits three distinct semantic indicators:

1. **`clinicalFlag` (Classification):** Categorical classification of the measurement against guideline intervals (e.g. `CRITICAL_LOW`, `LOW`, `IN_TARGET`, `HIGH`, `CRITICAL_HIGH`, `NORMAL`, `ELEVATED`, `STAGE_1_HYPERTENSION`, `STAGE_2_HYPERTENSION`, `HYPERTENSIVE_CRISIS`).
2. **`isCritical` (Urgency):** Indicates whether the reading demands prompt clinical attention or immediate self-management intervention (Level 2/3 Hypoglycemia, Severe BP, marked Hyperglycemia, HbA1c > 8.5%).
3. **`requiresEmergencyEscalation` (Emergency Protocol):** Restrictive boolean triggered **only** when red-flag criteria are met (Level 3 Hypo with impaired consciousness / third-party assistance required; Hypertensive Emergency with acute end-organ damage symptoms; Hyperglycemic Crisis with acute DKA/HHS symptoms). **A critical measurement does not automatically trigger emergency dispatch without qualifying clinical symptoms.**

---

## 2. Blood Glucose Decision Rules (ADA 2026 Standards)

### Rule CR-GLUC-001: Level 3 Severe Hypoglycemia
- **Rule Identifier:** `CR-GLUC-001`
- **Intended Population:** Adult and pediatric patients with Type 1 or Type 2 Diabetes on insulin or insulin secretagogues.
- **Threshold:** Blood glucose < 54 mg/dL (< 3.0 mmol/L) **AND** cognitive/physical impairment requiring assistance from another person (`requiresAssistance: true` or `hasSevereSymptoms: true`).
- **Clinical Meaning:** Severe hypoglycemia with altered mental state, severe confusion, seizure, or unconsciousness.
- **Alert Severity:** Emergency (`isCritical: true`, `requiresEmergencyEscalation: true`).
- **Patient/Caregiver Guidance:** "EMERGENCY ACTION: Administer prescribed emergency glucagon (nasal or injectable) immediately. Call emergency services (108/911/112). Do NOT place food or liquids in mouth if the person is confused or unconscious. Place in recovery position."
- **Escalation Criteria:** Immediate emergency services dispatch and designated emergency caregiver notification.
- **Limitations:** Continuous glucose monitor (CGM) sensor lag may occur during rapid rates of change. Confirm with capillary blood glucose if feasible without delaying treatment.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-GLUC-002: Level 2 Clinically Significant Hypoglycemia
- **Rule Identifier:** `CR-GLUC-002`
- **Intended Population:** Patients with diabetes who are conscious, oriented, and able to ingest carbohydrates independently.
- **Threshold:** Blood glucose < 54 mg/dL (< 3.0 mmol/L) without requirement for third-party assistance.
- **Clinical Meaning:** Clinically significant hypoglycemia. High risk of neuroglycopenia if untreated.
- **Alert Severity:** Critical (`isCritical: true`, `requiresEmergencyEscalation: false`).
- **Patient-Facing Guidance:** "Consume 15–20g fast-acting glucose immediately (e.g. 4 glucose tablets, 1/2 cup fruit juice, or 1/2 can regular soda). Sit down, rest, and recheck in 15 minutes. If reading remains below 54 mg/dL after 2 treatment cycles or you feel confused, call for emergency assistance."
- **Escalation Criteria:** Escalate to emergency protocol if glucose remains < 54 mg/dL after 30 minutes or if altered mental status develops.
- **Limitations:** Does not replace clinical education on hypoglycemia unawareness.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-GLUC-003: Level 1 Hypoglycemia Alert
- **Rule Identifier:** `CR-GLUC-003`
- **Intended Population:** All patients with diabetes.
- **Threshold:** Blood glucose 54 to 69 mg/dL (3.0 to 3.8 mmol/L).
- **Clinical Meaning:** Hypoglycemia alert value. Physiological threshold below safe fasting levels.
- **Alert Severity:** Alert (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient-Facing Guidance:** "Apply the Rule of 15: Take 15g fast-acting simple carbohydrates (such as 4 oz fruit juice or 3-4 glucose tablets). Wait 15 minutes and re-test. Once glucose is 70 mg/dL or higher, consume your regular meal or a complex carbohydrate snack."
- **Escalation Criteria:** None unless reading drops to Level 2/3.
- **Limitations:** Mild autonomic symptoms (tremor, sweating, tachycardia) may be absent in autonomic neuropathy.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-GLUC-004: In-Target Glycemia (Fasting and Postprandial)
- **Rule Identifier:** `CR-GLUC-004`
- **Intended Population:** Non-pregnant adults with diabetes.
- **Thresholds:**
  - *Fasting / Pre-meal:* 80 to 130 mg/dL (4.4 to 7.2 mmol/L), or clinician-approved patient profile range (`targetFastingMin`–`targetFastingMax`).
  - *Postprandial (1-2 hours after meal start):* < 180 mg/dL (< 10.0 mmol/L), or clinician-approved ceiling (`targetPostMealMax`).
  - *Low-normal fasting:* 70 to 79 mg/dL is categorized as `IN_TARGET` (low-normal).
- **Clinical Meaning:** Optimal glycemic control aligned with standard ADA goals to minimize microvascular and macrovascular complications.
- **Alert Severity:** Normal (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient-Facing Guidance:** "Optimal blood glucose within recommended target range. Maintain current nutrition, physical activity, and medication routines."
- **Escalation Criteria:** None.
- **Limitations:** Individual goals may be adjusted by treating physician (e.g. frailty, pediatric, pregnancy, severe comorbidities).
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-GLUC-005: Elevated Glycemia
- **Rule Identifier:** `CR-GLUC-005`
- **Intended Population:** All patients with diabetes.
- **Thresholds:**
  - Fasting > 130 mg/dL (or > `targetFastingMax`) up to 250 mg/dL.
  - Postprandial > 180 mg/dL (or > `targetPostMealMax`) up to 250 mg/dL.
- **Clinical Meaning:** Blood glucose above target range. Indicates acute dietary excursion, medication timing variance, stress, or illness.
- **Alert Severity:** Elevated (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient-Facing Guidance:** "Blood sugar is above your target range. Log meal contents, physical activity, and medication timing. Review persistent elevated patterns with your doctor."
- **Escalation Criteria:** None unless marked hyperglycemia (>250 mg/dL) persists.
- **Limitations:** Single values do not reflect overall control; evaluate time-in-range (TIR) and HbA1c.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-GLUC-006: Marked Hyperglycemia & Hyperglycemic Crisis
- **Rule Identifier:** `CR-GLUC-006`
- **Intended Population:** All patients with diabetes.
- **Thresholds:**
  - *Alert threshold:* Blood glucose > 250 mg/dL (> 13.9 mmol/L).
  - *Severe threshold:* Blood glucose ≥ 300 mg/dL (≥ 16.7 mmol/L).
- **Clinical Meaning:** Marked hyperglycemia. Risk of Diabetic Ketoacidosis (DKA) in Type 1 Diabetes or Hyperosmolar Hyperglycemic State (HHS) in Type 2 Diabetes.
- **Alert Severity:**
  - *Asymptomatic:* Critical (`isCritical: true`, `requiresEmergencyEscalation: false`).
  - *With DKA/HHS Symptoms:* Emergency (`isCritical: true`, `requiresEmergencyEscalation: true`).
- **Patient-Facing Guidance:**
  - *Asymptomatic:* "Marked hyperglycemia reading. Drink plenty of water to prevent dehydration. Check blood or urine ketones if instructed. Administer correction insulin only if pre-prescribed. Contact your care team if high readings persist."
  - *Symptomatic (vomiting, abdominal pain, shortness of breath, confusion, fruity breath):* "EMERGENCY ACTION: Seek immediate emergency medical care. Check ketones immediately if a meter is available. Do not delay medical evaluation."
- **Escalation Criteria:** Emergency escalation requires presence of severe clinical symptoms or documented heavy ketonemia.
- **Limitations:** Dehydration and laboratory errors may affect fingerstick accuracy at high ranges.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

## 3. Blood Pressure Decision Rules (ACC/AHA 2017 & ADA 2026)

### Rule CR-BP-001: Normal Blood Pressure
- **Rule Identifier:** `CR-BP-001`
- **Threshold:** Systolic < 120 mmHg **AND** Diastolic < 80 mmHg.
- **Clinical Meaning:** Normal blood pressure.
- **Alert Severity:** Normal (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Blood pressure reading is within standard normal parameters."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-BP-002: Elevated Blood Pressure
- **Rule Identifier:** `CR-BP-002`
- **Threshold:** Systolic 120–129 mmHg **AND** Diastolic < 80 mmHg.
- **Clinical Meaning:** Elevated systolic blood pressure without diastolic elevation.
- **Alert Severity:** Mild (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Systolic blood pressure is slightly elevated. Lifestyle modifications (aerobic physical activity, balanced low-sodium nutrition) help prevent hypertension progression."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-BP-003: Stage 1 Hypertension Range
- **Rule Identifier:** `CR-BP-003`
- **Threshold:** Systolic 130–139 mmHg **OR** Diastolic 80–89 mmHg.
- **Clinical Meaning:** Stage 1 hypertension range. Note: Clinical diagnosis requires multiple confirmed readings across separate clinical encounters.
- **Alert Severity:** Moderate (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Reading falls into the Stage 1 elevated category. Maintain consistent home blood pressure logging and discuss trends with your doctor."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-BP-004: Stage 2 Hypertension Range
- **Rule Identifier:** `CR-BP-004`
- **Threshold:** Systolic 140–179 mmHg **OR** Diastolic 90–119 mmHg.
- **Clinical Meaning:** Stage 2 hypertension range.
- **Alert Severity:** Moderate-High (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Stage 2 elevated blood pressure reading. Adhere to prescribed antihypertensive medications. Continue regular daily logging and share your trend log with your doctor."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-BP-005: Severe Blood Pressure Elevation & Hypertensive Emergency
- **Rule Identifier:** `CR-BP-005`
- **Threshold:** Systolic ≥ 180 mmHg **OR** Diastolic ≥ 120 mmHg.
- **Clinical Meaning:** Severe blood pressure elevation (Hypertensive crisis range).
- **Triage Protocol:**
  - *Asymptomatic (Hypertensive Urgency):* `isCritical: true`, `requiresEmergencyEscalation: false`.
    - *Guidance:* "Rest quietly in a seated position with feet flat for 5 minutes, then repeat measurement. If repeat reading remains at or above 180/120 mmHg, contact your physician or urgent care promptly. Seek immediate emergency care if chest pain, shortness of breath, severe headache, or numbness develop."
  - *Symptomatic (Hypertensive Emergency):* Accompanied by acute target-organ damage symptoms (`hasSevereSymptoms: true` — chest pain, dyspnea, acute neurological deficit, vision changes).
    - `isCritical: true`, `requiresEmergencyEscalation: true`.
    - *Guidance:* "EMERGENCY ACTION: Call emergency medical services (108/911/112) or go to the nearest emergency room immediately. Do not drive yourself. Rest quietly while waiting."
- **Limitations:** A single home measurement without acute symptoms must not trigger immediate ambulance dispatch. Repeat measurement and symptom triage are mandatory.
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

## 4. HbA1c Decision Rules (ADA 2026 Standards)

### Rule CR-A1C-001: Normal Reference Range
- **Rule Identifier:** `CR-A1C-001`
- **Threshold:** HbA1c < 5.7% (< 39 mmol/mol).
- **Clinical Meaning:** Normal non-diabetic reference range.
- **Alert Severity:** Normal (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Normal HbA1c value within standard reference range."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-A1C-002: Prediabetes Category
- **Rule Identifier:** `CR-A1C-002`
- **Threshold:** HbA1c 5.7% to 6.4% (39 to 46 mmol/mol).
- **Clinical Meaning:** Prediabetes category. Increased risk for development of Type 2 Diabetes.
- **Alert Severity:** Mild/Educational (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "HbA1c is in the prediabetes category. Structured lifestyle interventions (at least 150 min/week physical activity and balanced nutrition) can substantially reduce diabetes progression risk."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-A1C-003: Glycemic Target for Diabetes
- **Rule Identifier:** `CR-A1C-003`
- **Threshold:** HbA1c 6.5% up to individualized target (default < 7.0%, or custom `targetHbA1cMax` e.g. < 8.0% in older adults).
- **Clinical Meaning:** Meeting clinician-approved glycemic target for established diabetes.
- **Alert Severity:** In-Target (`isCritical: false`, `requiresEmergencyEscalation: false`).
- **Patient Guidance:** "Excellent long-term glycemic management. Maintain ongoing healthy lifestyle practices."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

### Rule CR-A1C-004: Significantly Elevated HbA1c
- **Rule Identifier:** `CR-A1C-004`
- **Threshold:** HbA1c > 8.5% (> 69 mmol/mol).
- **Clinical Meaning:** Significantly elevated chronic glycemic exposure. Substantially elevated risk of microvascular complications (retinopathy, nephropathy, neuropathy).
- **Alert Severity:** Critical (`isCritical: true`, `requiresEmergencyEscalation: false`).
- **Clinical Guidance:** "Schedule a comprehensive clinical review with your treating endocrinologist. Note: Medication and insulin adjustments must be made exclusively by your licensed clinician. HbA1c is a 3-month retrospective marker and does not require acute emergency dispatch."
- **Clinician Approval Status:** `PENDING_CLINICIAN_APPROVAL`
- **Review Date:** 2026-11-02

---

## 5. Clinician Review & Sign-Off Block

| Role | Name / License | Affiliation | Decision | Signature Date |
| :--- | :--- | :--- | :--- | :--- |
| **Lead Endocrinologist** | Pending Review | Specialty Diabetes Center | `PENDING_CLINICIAN_APPROVAL` | — |
| **Cardiology Reviewer** | Pending Review | Hospital Cardiology Panel | `PENDING_CLINICIAN_APPROVAL` | — |
| **Clinical Safety Officer**| AarogyaDamu Medical Board | Clinical Safety Committee | `PENDING_CLINICIAN_APPROVAL` | — |

