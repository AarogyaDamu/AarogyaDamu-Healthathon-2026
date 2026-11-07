# AarogyaDamu — Diabetes Care Journey Companion

**Health-a-thon 2026 Submission**
*A clinically responsible, interoperable digital care platform for Type 2 Diabetes management.*

---

## 1. Project Overview

**AarogyaDamu** ("Healthy Life") is an intelligent, interoperable digital healthcare ecosystem designed to support individuals living with Type 2 Diabetes, their treating physicians, and family caregivers.

By unifying three purpose-built client interfaces onto a single secure backend, AarogyaDamu bridges the gap between occasional clinical visits and daily self-management, maintaining continuous care coordination and verified healthcare interoperability.

---

## 2. Problem Being Solved

Type 2 Diabetes mellitus is a chronic metabolic disorder affecting over 500 million people worldwide. Effective glycemic management faces significant real-world barriers:

1. **Information Silos between Consultations:** Clinicians typically see patients every 3 to 6 months, relying on episodic recall or fragmented paper logs that fail to reveal glycemic variability.
2. **Medical Jargon & Patient Disengagement:** Complex clinical terminology, confusing lab acronyms (e.g., HbA1c, FBS, PPBS), and unstructured treatment plans overwhelm patients.
3. **Caregiver Exclusion:** Family members who actively assist elderly patients with medicine routines and dietary adherence lack secure, consent-governed access to treatment plans.
4. **Lack of Interoperability:** Health data recorded in consumer apps cannot be exchanged with electronic health records (EHRs) due to absence of standardized HL7 FHIR structures and verified LOINC codes.
5. **Unsafe Medical AI:** Generative AI tools often hallucinate clinical advice, suggest unauthorized medication adjustments, or fail to prioritize acute medical emergencies.

---

## 3. The Solution

AarogyaDamu addresses these challenges through a unified, clinically grounded platform:

- **Continuous Care Coordination:** Connects the Doctor, Patient, and Family Caregiver around an active, shared Diabetes Care Plan.
- **Centralized Language Simplification:** Translates complex medical terms into plain English for patients and caregivers while preserving standardized clinical codes for doctors.
- **HL7 FHIR R4 Interoperability:** Standardized RESTful FHIR R4 (v4.0.1) API with verified LOINC and UCUM bindings, allowing EHR export.
- **Server-Side Caregiver Consent:** Granular, patient-controlled delegation allowing family members to complete tasks and view health metrics without compromising privacy.
- **Clinical AI Safety Guardrails:** Hard barriers preventing AI from prescribing or diagnosing independently, with mandatory human-in-the-loop clinician sign-off.
- **Synthetic-Only Data:** 100% synthetic demonstration dataset with zero real patient information.

---

## 4. Technology Stack

- **Backend API:** Node.js 20 LTS, Express.js, TypeScript 5.3.
- **Database & ORM:** PostgreSQL 15+, Prisma ORM 5.14.
- **Doctor WebApp:** React 18, Vite 8, Tailwind CSS, Lucide Icons.
- **Mobile Companion:** React Native (Expo SDK 51), Expo Router, Lucide React Native.
- **Interoperability Standard:** HL7 FHIR R4 (v4.0.1).
- **Clinical Terminology:** Regenstrief LOINC 2.78, Unified Code for Units of Measure (UCUM), SNOMED CT, ICD-10.
- **Testing & Quality Assurance:** Jest 29, Vitest, ts-jest, Supertest.

---

## 5. Doctor WebApp (`apps/web`)

A dedicated clinical workstation for licensed diabetologists and endocrinologists:

- **Patient Command Center:** Roster management with risk stratification (High Risk, In-Target, Low Risk).
- **Longitudinal Glycemic Analytics:** Fasting, postprandial, bedtime, and random blood sugar trend visualization with ADA target bands.
- **Shared Care Plan Studio:** Formulation of individualized glycemic goals, lifestyle targets, and delegated care activities with versioning.
- **Medication Prescribing & Reconciliation:** Prescription creation, dosage management, and real-time adherence tracking.
- **Document & Lab Report Center:** Upload and review of laboratory reports with automated biomarker extraction.
- **AI Proposal Review Gate:** Human-in-the-loop review interface for approving or rejecting AI-generated care recommendations with mandatory clinical rationale.

---

## 6. Patient Mobile App (`apps/mobile` - Patient Experience)

An empathetic, daily health companion tailored for non-technical individuals:

- **Plain-English Health Dashboard:** Clear glycemic summary with intuitive, friendly labels.
- **Point-of-Care Glucose Logging:** Rapid logging with context tags (Morning Fasting, 2h After Meal, Bedtime, Anytime) and instant Rule-of-15 guidance for low sugar readings.
- **Medication Vault:** Daily schedule of doctor-prescribed medications with reminder notifications and one-tap intake recording.
- **Care Activities & Habits:** Daily action checklist for walks, hydration, foot checks, and pillbox replenishment.
- **Consultation Scheduling:** Interactive appointment booking with an 18-point clinical intake wizard.
- **Damu AI Companion:** Conversational assistant for diabetes education, diet tips, and lifestyle motivation, governed by informed consent disclaimers.
- **Emergency SOS:** Rapid 112 emergency calling and automated SMS alert dispatch to registered family caregivers.

---

## 7. Caregiver Mobile App (`apps/mobile` - Caregiver Experience)

A specialized companion for adult children and family health companions:

- **Consent-Governed Patient Linking:** Cryptographic authorization requiring explicit patient permission.
- **Multi-Patient Switching:** Seamless switching for caregivers managing care for multiple elderly family members.
- **Delegated Task Execution:** Complete tasks on behalf of the patient (e.g. pillbox refills, accompaniment on walks) with explicit caregiver attribution.
- **Authorized Health Visibility:** Read-only access to authorized glucose trends, medications, and upcoming clinic visits.
- **Immediate Boundary Enforcement:** Immediate termination of all access when consent is revoked or expired.

---

## 8. AI Capabilities & Clinical Safety

AarogyaDamu integrates artificial intelligence strictly as an assistive and educational tool:

- **Zero Autonomous Clinical Actions:** The AI engine is programmatically barred from prescribing medications, altering dosages, titrating insulin, or making independent medical diagnoses (`riskClassifier.ts`).
- **Clinician Sign-off Required:** All AI-drafted proposals (e.g. proposed care plan goals, suggested follow-ups) require explicit physician approval before taking effect.
- **Deterministic ADA 2026 Safety Rules:** Vitals are evaluated against deterministic clinical guidelines rather than probabilistic LLMs, flagging Level 1 (54–69 mg/dL) and Level 2/3 (<54 mg/dL) hypoglycemia immediately.
- **Emergency Precedence:** Detection of acute hypoglycemia or critical symptoms immediately aborts AI workflows and escalates to emergency services.
- **Unverified Document Flagging:** Automated OCR data is explicitly watermarked as *Unverified* until reviewed by a human clinician or patient.

---

## 9. HL7 FHIR R4 Implementation

AarogyaDamu implements an interoperability layer conforming to **HL7 FHIR Release 4 version 4.0.1**:

- **Core Resources Mapped:**
  - `Patient`: Demographics, synthetic identifier, managing practitioner reference.
  - `Practitioner`: Clinician identity with Diabetologist qualification.
  - `RelatedPerson`: Caregiver identity linked to patient with role coding.
  - `Observation`: Vital signs and laboratory panels with verified LOINC and UCUM codes.
  - `Condition`: Type 2 Diabetes Mellitus with SNOMED CT `44054006` and ICD-10 `E11`.
  - `CarePlan` & `Goal`: Structured diabetes care plan with individualized targets.
  - `Task`: Delegated and scheduled care activities.
  - `MedicationRequest` & `MedicationStatement`: Prescriptions and adherence events.
  - `Encounter`: Ambulatory Diabetology clinic visits.
  - `DiagnosticReport` & `DocumentReference`: Laboratory reports and clinical attachments.
  - `Consent`: Granular caregiver access delegation records.
  - `AuditEvent`: Security and clinical mutation audit trail.
- **API Endpoints:** Mounted at `/api/fhir/r4/` with CapabilityStatement (`/metadata`) and complete patient export (`/Patient/:id/$everything`).
- **Validation:** Every resource is verified against FHIR schema invariants, returning `OperationOutcome` on errors.

*Full specification: [`docs/FHIR-R4.md`](docs/FHIR-R4.md)*

---

## 10. LOINC and UCUM Implementation

Standardized laboratory and vital measurements use verified clinical codes:

- **Fasting Glucose (Point-of-Care Glucometer):** LOINC `14771-0` (`mg/dL`)
- **Fasting Glucose (Venous Serum/Plasma Lab):** LOINC `1558-6` (`mg/dL`)
- **Postprandial Glucose (2h Post-Meal):** LOINC `88365-2` (`mg/dL`)
- **Pre-Meal Glucose:** LOINC `72171-2` (`mg/dL`)
- **Bedtime Glucose:** LOINC `74774-1` (`mg/dL`)
- **Random Blood Glucose:** LOINC `2339-0` (`mg/dL`)
- **Hemoglobin A1c (HbA1c):** LOINC `4548-4` (`%`)
- **Blood Pressure Panel:** LOINC `85354-9` (Systolic `8480-6`, Diastolic `8462-4`, `mm[Hg]`)
- **Body Weight:** LOINC `29463-7` (`kg`)
- **Heart Rate:** LOINC `8867-4` (`/min`)

*Full dictionary: [`docs/LOINC-MAPPINGS.md`](docs/LOINC-MAPPINGS.md)*

---

## 11. Security, Privacy & Compliance

- **Authentication:** Short-lived JWT access tokens (15 min) with cryptographic refresh token rotation and server-side session revocation.
- **Server-Side Caregiver Consent:** Permissions checked on every API call; revoked consents immediately block caregiver access with HTTP 403.
- **Zero Real Patient Data:** Complete sanitization of local SQLite databases, backups, and upload folders. All demo data is 100% synthetic.
- **Transport Security:** HSTS, X-Content-Type-Options, X-Frame-Options, and strict CORS allowlists.
- **Audit Trails:** Immutable logging of all clinical mutations and access events.

*Full security whitepaper: [`docs/SECURITY-PRIVACY.md`](docs/SECURITY-PRIVACY.md)*

---

## 12. Local Installation Instructions

### Prerequisites
- Node.js `>= 20.12.0 LTS`
- npm `>= 10.8.0`
- PostgreSQL 15+ (local or containerized)

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/your-username/aarogyadamu-project3.git
cd aarogyadamu-project3
npm install
```

### Step 2: Configure Environment
```bash
# Copy root environment example
cp .env.example .env
cp services/api/.env.example services/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/mobile/.env.example apps/mobile/.env
```

### Step 3: Database Migration & Synthetic Seed
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

### Step 4: Run Development Services
```bash
# Start backend API (Port 4000)
npm run dev:api

# Start Doctor WebApp (Port 5173)
npm run dev:web

# Start Mobile App (Expo Metro)
npm run dev:mobile
```

---

## 13. Environment Configuration

| Variable | Workspace | Purpose | Example / Default |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `services/api` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/aarogyadamu_dev` |
| `JWT_SECRET` | `services/api` | Secret for signing JWT access tokens | `min-32-chars-cryptographic-secret` |
| `FHIR_SERVER_URL` | `services/api` | Base URL for generated FHIR resources | `https://app.example.com/api/fhir/r4` |
| `ALLOWED_ORIGINS` | `services/api` | Allowed origins for CORS | `http://localhost:5173,http://localhost:8081` |
| `VITE_API_URL` | `apps/web` | API gateway URL for Doctor WebApp | `http://localhost:4000/api` (or `https://app.example.com/api`) |
| `EXPO_PUBLIC_API_URL` | `apps/mobile` | API gateway URL for Mobile App | `http://localhost:4000/api` (or LAN IP) |

---

## 14. Deployment Instructions

### Production WebApp (`https://app.example.com`)
```bash
# Build production web bundle
npm --workspace=apps/web run build
# Deploy apps/web/dist to NGINX, Cloudflare Pages, or AWS S3+CloudFront with SPA routing
```

### Production API Gateway
```bash
# Compile TypeScript API
npm run build:api
# Run migrations on production PostgreSQL
npm run db:deploy
# Start cluster via PM2
pm2 start services/api/dist/server.js --name "aarogyadamu-api" -i max
```

### Production Android App (EAS)
```bash
cd apps/mobile
eas build --platform android --profile production
```

*Full deployment runbook: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)*

---

## 15. Demonstration Accounts

All demo accounts are populated with **realistic synthetic demonstration data** (`isSyntheticDemo: true`):

| Role | Email Address | Password | Profile Name | Clinical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Doctor** | `dr.rc@aarogyadamu.local` | `DemoPassword123!` | Dr. Rupam Choudhary | Treating Diabetologist |
| **Patient** | `demo.patient1@aarogyadamu.local` | `DemoPassword123!` | Ramesh Deshmukh | Type 2 Diabetes, on Metformin |
| **Caregiver**| `meera.joshi@family.aarogyadamu.local` | `DemoPassword123!` | Meera Joshi | Daughter & Authorized Caregiver |

*Step-by-step testing guide: [`docs/EVALUATOR-GUIDE.md`](docs/EVALUATOR-GUIDE.md)*

---

## 16. Automated Verification

Execute all automated verification suites:

```bash
# FHIR R4 Interoperability & Conformance (22 tests)
npx jest --config services/api/jest.config.js services/api/src/__tests__/fhir_r4.test.ts

# LOINC & UCUM Terminology Mapping (7 tests)
npx jest --config services/api/jest.config.js services/api/src/__tests__/terminology_loinc.test.ts

# Synthetic Data & PII Sanitization (4 tests)
npx jest --config services/api/jest.config.js services/api/src/__tests__/synthetic_data_integrity.test.ts

# AI Clinical Safety & Governance (70 tests)
npx jest --config services/api/jest.config.js services/api/src/__tests__/p0_7_1_agentic_contracts.test.ts

# Doctor WebApp Tests (36 tests)
npm run test:web

# Patient & Caregiver Mobile Tests (46 tests)
npm run test:mobile
```
