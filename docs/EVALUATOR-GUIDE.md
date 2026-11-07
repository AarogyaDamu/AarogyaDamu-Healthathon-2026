# AarogyaDamu — Evaluator & Clinical Demo Guide (Health-a-thon 2026)

**Project:** AarogyaDamu — Diabetes Care Journey Companion
**Evaluation Scope:** Doctor WebApp, Patient Mobile App, Caregiver Mobile App, FHIR R4 Interoperability, LOINC & UCUM Coding, AI Safety, and Care Coordination

---

## 1. Quick Start Setup (Local Evaluator Environment)

### Step 1: Install Dependencies & Setup Database
```bash
# Install root and workspace dependencies
npm install

# Generate Prisma Client & Run Database Migrations
npm run db:generate
npm run db:migrate

# Seed Synthetic Clinical Baseline Dataset
npm run db:seed
```

### Step 2: Start Development Servers
```bash
# Terminal 1: Start Express API Backend (Port 4000)
npm run dev:api

# Terminal 2: Start Doctor WebApp (Port 5173)
npm run dev:web

# Terminal 3: Start Mobile App for Patient & Caregiver (Expo Metro Bundler)
npm run dev:mobile
# (Press 'w' to run in web browser, or 'a' for Android emulator)
```

---

## 2. Safe Synthetic Demonstration Accounts

All accounts use **100% synthetic demonstration data** with zero real patient information:

| Role | Email Address | Demonstration Password | Profile Identity | Assigned Relationships |
| :--- | :--- | :--- | :--- | :--- |
| **Doctor** | `dr.rc@aarogyadamu.local` | `DemoPassword123!` | Dr. Rupam Choudhary (Diabetologist) | Assigned to Patient Ramesh Deshmukh |
| **Patient** | `demo.patient1@aarogyadamu.local` | `DemoPassword123!` | Ramesh Deshmukh (Age 60, T2D since 2021) | Primary Doctor: Dr. Rupam Choudhary |
| **Caregiver**| `meera.joshi@family.aarogyadamu.local` | `DemoPassword123!` | Meera Joshi (Daughter & Health Companion) | Authorized Caregiver for Ramesh |

---

## 3. Step-by-Step Workflow Verification Guide

### Workflow 1: Glycemic Monitoring & Point-of-Care Logging
1. Sign in to the **Patient Mobile App** as `demo.patient1@aarogyadamu.local`.
2. Tap **Log Blood Sugar** on the dashboard.
3. Enter reading: `126 mg/dL` with context **Morning (Before Breakfast)**.
4. Save reading. Notice the friendly status: *"In Target Range"*.
5. Switch to **Doctor WebApp** at `http://localhost:5173` and sign in as `dr.rc@aarogyadamu.local`.
6. Select patient **Ramesh Deshmukh**. Open the **Health Journal / Timeline** tab.
7. Verify that the new `126 mg/dL` fasting glucose reading appears immediately with LOINC coding and trend analytics.

### Workflow 2: Prescription Issuance & Adherence Tracking
1. In the **Doctor WebApp**, open the **Prescriptions** tab for Ramesh Deshmukh.
2. Prescribe medicine: `Tab Metformin 500mg SR`, dosage: `1 tablet`, timing: `Evening with dinner`.
3. In the **Patient Mobile App**, tap the **Medicines** tab.
4. The prescribed Metformin appears with clear instructions: *"Take 1 tablet with the evening meal"*.
5. Tap **Mark Taken**.
6. In the **Doctor WebApp**, observe that the patient adherence percentage increases and the intake timestamp updates.

### Workflow 3: Shared Care Plan & Goal Progress
1. In the **Doctor WebApp**, navigate to **Care Plan**.
2. View active diabetes plan goals (Fasting glucose 80–130 mg/dL, 30-min evening walk).
3. In the **Patient Mobile App**, navigate to **Tasks**.
4. Check off the daily activity: *"30-minute post-dinner brisk walk"*.
5. In the **Doctor WebApp**, the task progress bar and completion timestamp reflect the update.

### Workflow 4: Caregiver Delegation & Cross-Account Synchronization
1. Sign in to the **Caregiver Mobile App** as `meera.joshi@family.aarogyadamu.local`.
2. Select patient **Ramesh Deshmukh** from the patient selector.
3. View delegated tasks: Meera can see the delegated *"Weekly pill box replenishment"*.
4. Tap **Complete Task on Behalf of Patient**.
5. Both the Patient App and Doctor WebApp update in real-time, attributing the completion to: *"Completed by Caregiver (Meera Joshi)"*.

### Workflow 5: Caregiver Consent Revocation & Immediate Boundary Enforcement
1. In the **Patient Mobile App**, open **Profile -> Caregiver Access**.
2. Tap **Revoke Access** for Meera Joshi.
3. Switch back to the **Caregiver Mobile App** and pull to refresh.
4. Access is immediately terminated with a clear notice: *"Access has been ended by the patient"*. Any attempt to query records returns HTTP 403 Forbidden.

### Workflow 6: HL7 FHIR R4 Interoperability & LOINC Export
1. Send an authenticated HTTP request to the FHIR gateway:
   ```bash
   # Retrieve FHIR CapabilityStatement
   curl http://localhost:4000/api/fhir/r4/metadata

   # Retrieve Patient Record Bundle ($everything)
   curl -H "Authorization: Bearer <DOCTOR_OR_PATIENT_TOKEN>" \
        http://localhost:4000/api/fhir/r4/Patient/<PATIENT_ID>/$everything
   ```
2. Verify FHIR R4 conformance:
   - `Observation` entries contain `system: "http://loinc.org"` with code `14771-0` (point-of-care) or `1558-6` (fasting lab).
   - Numerical measurements use official UCUM units: `mg/dL`, `%`, `mm[Hg]`.
   - `CarePlan` contains SNOMED category `734163000` (Diabetes mellitus care plan).
   - `Condition` contains SNOMED `44054006` and ICD-10 `E11`.

### Workflow 7: Damu Governed Agent Planning & Explicit Action Confirmation
1. In the **Patient Mobile App**, tap the **Damu AI Companion** tab.
2. Ask Damu via voice or type: `"Plan to schedule fasting blood glucose check."`
3. Notice Damu formulates a **Governed Agent Plan** with bounded scope:
   - **Action:** *Schedule Care Task*
   - **Risk Level:** *Medium Risk* (amber badge)
   - **Status:** *Awaiting Your Confirmation*
   - **Task Details:** *Morning Fasting Blood Glucose Check*, Category: *GLUCOSE CHECK*, Notes: *Log fasting sugar level before breakfast*.
4. Tap **Confirm**.
5. The action confirms instantly, transitioning the card in-place to **Completed** (green badge).
6. In the database and care timeline, a persistent `CareTask` is created for Ramesh Deshmukh with assigned role, instructions, and an append-only audit trail in `AgentAuditRecord`.
7. Re-confirming the action proves strict idempotency: returns the cached result without duplicate task creation.

### Workflow 8: Damu Sarvam Bulbul Voice Companion & Multilingual Speech
1. In the **Patient Mobile App**, tap the microphone on the Damu screen.
2. Damu records voice via high-quality AAC/M4A, automatically mapped to standard `audio/mp4` MIME for Sarvam STT.
3. Damu speaks back using genuine **Sarvam Bulbul TTS** (`bulbul:v4-flash`, speaker `shubh_enhi_ads`).
4. Replay or toggle Indian English, Hindi, or Marathi voice synthesis without robotic browser fallbacks.

---

## 4. Running Automated Verification Suites

```bash
# 1. Run Governed Agent Plan Confirmation Tests (21 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/governed_agent_confirmation.test.ts

# 2. Run Sarvam Voice & Audio Integration Tests (14 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/sarvam_voice_integration.test.ts

# 3. Run AI Safety & Clinical Governance Contracts (70 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/p0_7_1_agentic_contracts.test.ts

# 4. Run FHIR R4 Interoperability & Conformance Tests (22 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/fhir_r4.test.ts

# 5. Run Terminology & LOINC Mapping Tests (7 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/terminology_loinc.test.ts

# 6. Run Synthetic Data & PII Sanitization Tests (4 tests)
$env:NODE_ENV="test"; $env:AAROGYADAMU_TEST_TOKEN="test-token"; $env:DATABASE_URL="postgresql://test:test@localhost:5432/aarogyadamu_test"; node node_modules/jest/bin/jest.js --config services/api/jest.config.js services/api/src/__tests__/synthetic_data_integrity.test.ts

# 7. Run Doctor WebApp Tests (36 tests)
npm run test:web

# 8. Run Mobile App Tests (46 tests)
npm run test:mobile

# 9. Run Full Monorepo Typecheck & Production Build
npm run typecheck
```
