# AarogyaDamu — AI Safety & Clinical Governance Framework

**Standard:** Clinical Decision Support (CDS) Governance & Safe Medical AI
**Guideline References:** ADA Standards of Care in Diabetes (2026), FDA Software as a Medical Device (SaMD), WHO Ethics and Governance of AI for Health
**Classification:** Human-in-the-Loop Clinical Governance

---

## 1. Core Principles of Medical AI Safety

AarogyaDamu implements an **assistive, bounded, and audited AI framework**. The Damu AI engine acts strictly as an educational companion and clinical assistant—never as an autonomous medical authority.

```
+-------------------------------------------------------------------------+
|                       IRON CLINICAL GUARDRAILS                          |
|                                                                         |
|  1. AI CANNOT PRESCRIBE MEDICATIONS.                                    |
|  2. AI CANNOT ALTER DOSES OR TITRATE INSULIN.                           |
|  3. AI CANNOT INDEPENDENTLY DIAGNOSE ILLNESS OR CONDITIONS.             |
|  4. ALL AI CLINICAL RECOMMENDATIONS REQUIRE CLINICIAN SIGN-OFF.         |
|  5. CRITICAL HYPOGLYCEMIA (<54 mg/dL) HALTS AGENT OPERATIONS FOR SOS.   |
+-------------------------------------------------------------------------+
```

---

## 2. Hard Clinical Guardrails (Prohibited Actions)

The system enforces deterministic programmatic gates (`riskClassifier.ts` and `approvalManager.ts`) that intercept prohibited actions before any execution:

| Prohibited Action Category | Interception Mechanism | Deterministic System Response |
| :--- | :--- | :--- |
| **Prescribing Medication** | `PROHIBITED_ACTION_REFUSAL` | Immediate rejection: *"AI agents cannot prescribe medications. Prescriptions must be issued directly by your licensed diabetologist."* |
| **Altering Medicine Dosage** | `PROHIBITED_ACTION_REFUSAL` | Immediate rejection: *"Modifying medicine dosage or insulin units requires treating physician evaluation and approval."* |
| **Independent Medical Diagnosis** | `PROHIBITED_ACTION_REFUSAL` | Immediate rejection: *"Clinical diagnosis requires comprehensive in-person medical evaluation and confirmed laboratory biomarkers."* |
| **Bypassing Patient Consent** | Permission Boundary Check | HTTP 403 Forbidden: *"Action blocked: Caregiver access requires active patient consent."* |

---

## 3. Human-in-the-Loop Clinical Review Workflow

When an AI agent drafts clinical material (e.g. proposed care plan goals, suggested follow-up tasks, or clinical encounter documentation):
1. **Status = `PENDING_CLINICIAN_APPROVAL`:** The action cannot be auto-executed or viewed by the patient as an active order.
2. **Physician Review Gate:** The proposal appears in the Doctor WebApp with risk tier categorization (`HIGH_RISK`), extracted parameters, and evidence.
3. **Explicit Action Required:**
   - **Approve:** The doctor reviews notes, modifies if necessary, and signs off.
   - **Reject:** The doctor provides a mandatory clinical rationale (minimum 3 characters).
4. **Anti-Tampering Binding:** Approvals verify plan version, action ID, and clinician identity cryptographically.

---

## 4. Deterministic Clinical Safety Evaluation (Anti-Hallucination)

Instead of relying on LLM probabilistic outputs for vital evaluation, AarogyaDamu routes all measurements through a **pure deterministic evaluator (`evaluateClinicalSafety.ts`)** grounded in ADA 2026 Standards of Care:

- **Level 1 Hypoglycemia (54–69 mg/dL):** Triggers `ALERT_LOW` with standardized Rule-of-15 guidance (15g rapid carbs, retest in 15 minutes).
- **Level 2 Hypoglycemia (< 54 mg/dL):** Triggers `CRITICAL_LOW` and immediate emergency precedence.
- **Level 3 Severe Hypoglycemia:** Identified if confusion, seizure, or third-party assistance is flagged; immediately escalates to Emergency SOS.
- **Severe Hyperglycemia (> 300 mg/dL):** Triggers `CRITICAL_HIGH`, screening for DKA symptoms (nausea, shortness of breath, fruity breath).

---

## 5. Emergency Precedence & Workflow Interruption

If an acute safety event occurs during any AI interaction (e.g., patient voice-logs *"My sugar is 48 and I feel dizzy"* or severe chest pain):
1. The AI conversation or agent plan is immediately aborted (`EMERGENCY_HALT`).
2. Secondary tool execution is suspended.
3. The Emergency SOS protocol is triggered, surfacing local emergency dispatch (112), nearest emergency room navigation, and instant SMS alerts to registered caregivers.

---

## 6. Document & OCR Verification Policy

1. All OCR-extracted lab reports and prescriptions are flagged with:
   - `processingStatus: "READY"`
   - `clinicalReviewStatus: "UNVERIFIED"`
2. Unverified reports display prominent visual indicators to patients and clinicians.
3. Extracted biomarkers are not added to longitudinal decision trends until validated by the patient or clinician.
