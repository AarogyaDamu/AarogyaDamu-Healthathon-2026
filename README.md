# AarogyaDamu — Diabetes Care Journey Companion

**Health-a-thon 2026 Submission**  
*A clinically responsible, interoperable digital care platform for Type 2 Diabetes management.*

---

## 1. Project Architecture & Workspace Overview

AarogyaDamu is engineered as a secure, production-grade monorepo using npm workspaces, featuring a strict **Two-Product Separation**:

```
.
├── apps/
│   ├── web/                    # [Product 1] Doctor Workstation (React 18 + Vite SPA, Tailwind CSS)
│   └── mobile/                 # [Product 2] Patient & Caregiver Companion (Expo SDK 53 + React Native PWA)
├── services/
│   └── api/                    # Core Clinical API (Node.js 22 LTS, Express, Prisma ORM, PostgreSQL RLS)
├── packages/
│   └── contracts/              # Shared TypeScript contracts, validation schemas, and domain interfaces
├── docs/                       # Specifications, FHIR R4 mapping, runbooks, and architectural ADRs
└── .github/workflows/          # Production-grade GitHub Actions CI/CD pipeline with continuous delivery
```

### Architectural Separation
1. **Doctor Workstation (`apps/web`)**: A dedicated clinical workstation exclusively for licensed Diabetologists and Endocrinologists. Enforces strict doctor-only authentication gates, multi-patient panel management, clinical review workspaces, longitudinal glycemic monitoring, medication reconciliation, and human-in-the-loop AI proposal approval.
2. **Patient & Caregiver App (`apps/mobile`)**: A responsive mobile application running on iOS, Android, and Web/PWA (`build:mobile:web`). Provides plain-English health journaling, medication vault with reminders, consultation scheduling, emergency SOS, and cryptographic patient-to-caregiver consent delegation.
3. **Clinical Core API (`services/api`)**: High-performance Express API protected by PostgreSQL Row Level Security (RLS) across 46 tables, signed tenant context tokens (`RLS_CONTEXT_SECRET`), HL7 FHIR R4 interoperability, and strict role-based access control.

---

## 2. Prerequisites & System Requirements

- **Node.js**: `22.14.0 LTS` (strictly `>= 22.0.0 < 23.0.0`)
- **npm**: `>= 10.8.0`
- **PostgreSQL**: `16+` (or disposable container via Docker)
- **Git**: `2.40+`

---

## 3. Quick Start & Local Setup

### Step 1: Install Dependencies
Always install dependencies from the repository root using the committed lockfile:
```bash
npm ci
```
*Note: Do not install packages individually inside child workspaces; root `npm ci` hoists and resolves all workspace links cleanly.*

### Step 2: Configure Environment Variables
Copy and sanitize environment configurations across workspaces:
```bash
# Root environment
cp .env.example .env

# Services API
cp services/api/.env.example services/api/.env

# Doctor Web Workstation
cp apps/web/.env.example apps/web/.env

# Mobile Companion
cp apps/mobile/.env.example apps/mobile/.env
```

### Step 3: Database Client Generation, Validation & Migration
```bash
# Generate Prisma Client
npm run db:generate

# Validate Prisma schema
npm run db:validate

# Apply migrations to your local PostgreSQL database
npm run db:migrate

# Seed synthetic demonstration records
npm run db:seed
```

---

## 4. Local Development Execution Commands

Start services in separate terminals or use the provided bat scripts:

| Service | Port / URL | Local Command | Description |
| :--- | :--- | :--- | :--- |
| **Backend API** | `http://localhost:4000` | `npm run dev:api` | Node/Express API with TypeScript hot-reload |
| **Doctor Workstation** | `http://localhost:5173` | `npm run dev:web` | Vite dev server for clinical workstation |
| **Patient/Caregiver Mobile** | Metro Bundler | `npm run dev:mobile` | Expo React Native development server |
| **Mobile Web PWA** | `http://localhost:8081` | `npm run dev:mobile:web` | Expo web preview for responsive testing |

*Convenience scripts: `start-dev.bat` starts all three services in parallel; `stop-dev.bat` gracefully terminates them.*

---

## 5. Verification & Testing

Every layer of the platform is backed by comprehensive automated test suites:

```bash
# 1. Run all test suites across the monorepo
npm test

# 2. Doctor Workstation Web Tests (44 tests, 9 suites)
npm run test:web

# 3. Patient & Caregiver Mobile Tests (57 tests, 7 suites)
npm run test:mobile

# 4. Backend API Tests (requires PostgreSQL test database)
npm run test:api

# 5. Targeted API Security & Interoperability Unit Tests
npx jest -c services/api/jest.config.js services/api/src/__tests__/fhir_r4.test.ts
npx jest -c services/api/jest.config.js services/api/src/__tests__/terminology_loinc.test.ts
npx jest -c services/api/jest.config.js services/api/src/__tests__/commercial_contracts.test.ts
npx jest -c services/api/jest.config.js services/api/src/__tests__/sarvam_ocr_unit.test.ts
npx jest -c services/api/jest.config.js services/api/src/__tests__/env_staging_production.test.ts
npx jest -c services/api/jest.config.js services/api/src/__tests__/email_service.test.ts
```

### Typecheck & Build Pipeline
```bash
# Typecheck all workspaces
npm run typecheck

# Build all production assets
npm run build

# Export production mobile web bundle
npm run build:mobile:web
```

---

## 6. Environment Variables & Secret Governance

| Variable | Workspace | Required | Purpose | Production Requirement |
| :--- | :--- | :---: | :--- | :--- |
| `DATABASE_URL` | `services/api` | Yes | PostgreSQL connection pool URL | Strong credentials; SSL enabled |
| `JWT_SECRET` | `services/api` | Yes | HMAC key for signing access tokens | Min 32 chars; distinct secret manager key |
| `RLS_CONTEXT_SECRET` | `services/api` | Yes | HMAC key for signing RLS tenant tokens | Min 32 chars; distinct cryptographic secret |
| `DOCTOR_INVITATION_SECRET` | `services/api` | Yes | Secret for signing doctor invite tokens | Min 32 chars; distinct cryptographic secret |
| `DOCTOR_INVITATION_ADMIN_KEY`| `services/api` | Yes | Header key for admin invite creation | Min 32 chars; distinct cryptographic secret |
| `FHIR_SERVER_URL` | `services/api` | No | Base URI for generated FHIR resources | Defaults to `http://localhost:4000/api/fhir/r4` |
| `ALLOWED_ORIGINS` | `services/api` | Yes | CORS allowed origins | Strict HTTPS origins in production |
| `VITE_API_URL` | `apps/web` | Yes | API Gateway URL for Doctor WebApp | Public HTTPS API domain |
| `EXPO_PUBLIC_API_URL` | `apps/mobile` | Yes | API Gateway URL for Mobile App | Public HTTPS API domain or local LAN IP |
| `SARVAM_API_KEY` | `services/api` | No | Sarvam AI TTS/STT API key | Optional (gracefully falls back if absent) |
| `GROQ_API_KEY` | `services/api` | No | Groq LLM API key | Optional (falls back to deterministic logic) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `services/api` | No | Google Cloud Vision OCR credentials | Optional in dev (falls back to synthetic OCR) |

---

## 7. Healthcare Interoperability (HL7 FHIR R4 & LOINC)

AarogyaDamu conforms strictly to **HL7 FHIR Release 4 (v4.0.1)** and **Regenstrief LOINC 2.78**:

- **FHIR R4 Endpoint**: `/api/fhir/r4`
  - `/metadata`: Complete FHIR CapabilityStatement declaring supported REST interactions.
  - `/Patient/:id`: Patient demographics and managing practitioner links.
  - `/Patient/:id/$everything`: Comprehensive longitudinal patient bundle export.
  - `/Observation`: Standardized clinical observations with verified LOINC codes and UCUM units.
  - `/Condition`: Diagnoses with SNOMED CT (`44054006`) and ICD-10 (`E11`).
  - `/CarePlan` & `/Goal`: Individualized treatment targets and care pathways.
  - `/MedicationRequest` & `/MedicationStatement`: Active prescriptions and adherence tracking.
  - `/Consent`: Cryptographic caregiver delegation record.
- **Key LOINC & UCUM Mappings**:
  - `14771-0`: Glucose [Mass/volume] in Blood by Glucometer (`mg/dL`)
  - `1558-6`: Fasting Glucose in Serum/Plasma Lab (`mg/dL`)
  - `88365-2`: Postprandial Glucose 2h Post-Meal (`mg/dL`)
  - `4548-4`: Hemoglobin A1c (HbA1c) (`%`)
  - `85354-9`: Blood Pressure Panel (Systolic `8480-6`, Diastolic `8462-4`, `mm[Hg]`)
  - `29463-7`: Body Weight (`kg`)
  - `8867-4`: Heart Rate (`/min`)

---

## 8. Synthetic Demonstration Accounts

All records generated by `npm run db:seed` are 100% synthetic (`isSyntheticDemo: true`):

| Role | Email Address | Password | Profile Name | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Doctor** | `dr.rc@aarogyadamu.local` | `DemoPassword123!` | Dr. Rupam Choudhary | Licensed Diabetologist |
| **Doctor (Staging)** | `dr.staging.demo@aarogyadamu.local` | `DemoPassword123!` | Dr. Asha Rao | Secondary Staging Clinician |
| **Patient** | `demo.patient1@aarogyadamu.local` | `DemoPassword123!` | Ramesh Deshmukh | Type 2 Diabetes, on Metformin |
| **Caregiver** | `meera.joshi@family.aarogyadamu.local` | `DemoPassword123!` | Meera Joshi | Daughter & Authorized Caregiver |

---

## 9. CI/CD Pipeline & Deployment Runbook

The automated GitHub Actions workflow (`.github/workflows/ci.yml`) enforces production-grade verification:
1. **Concurrency Controls**: Automatically cancels obsolete in-flight runs when new commits arrive.
2. **Lockfile & Secret Protection**: Enforces `git diff --exit-code package-lock.json` and scans for untracked `.env` files.
3. **Database Migration Gate**: Spins up an ephemeral `postgres:16-alpine` container and executes `prisma:deploy` before running tests.
4. **Multi-Workspace Testing**: Executes backend integration tests, web test suite, and mobile test suite in parallel.
5. **Continuous Delivery**:
   - `deploy-staging`: Deploys automatically on pushes to `main`.
   - `deploy-production`: Requires GitHub Environment Protection manual sign-off for release tags (`v*`).
   - Post-deployment automated health probes ensure zero-downtime availability.

### Deployment Rollback Procedure
If a production deployment health check fails or an anomaly is detected:
1. Revert to the last known healthy release tag: `git checkout v1.0.X`
2. Redeploy the previous build artifacts (`web-production-bundle`, `api-production-bundle`).
3. If database changes occurred, apply forward-fixing non-destructive migrations (never drop columns in production).
4. Verify system liveness via `curl -f https://api.aarogyadamu.net/health`.

---

## 10. Clinical Safety & Responsible AI Governance

- **Zero Autonomous Clinical Decisions**: AI models cannot alter prescriptions, diagnose conditions, or bypass clinical workflows.
- **Mandatory Human-in-the-Loop**: All AI-assisted suggestions generate pending proposals that require clinician review and explicit signed approval.
- **Rule-of-15 Hypoglycemia Protection**: Urgent glycemic thresholds (Level 1: 54-69 mg/dL; Level 2/3: <54 mg/dL) immediately trigger safety alerts and 112 emergency routing.
- **Graceful Provider Fallback**: If external AI or OCR services (Sarvam AI, Groq, Google Vision) are unavailable, the system safely falls back to deterministic local processing with zero downtime or crash.
