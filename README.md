# AarogyaDamu — Diabetes Care Journey Companion
### Health-a-thon 2026 — Project 3 (Pilot-Ready Edition)

> **AarogyaDamu** is a production-grade diabetes care platform unifying Patients, Caregivers, and Clinicians into one cohesive, secure, and intelligent ecosystem. Built with clinical rigor adhering to **ADA (American Diabetes Association) Standards of Care** and **ABDM (Ayushman Bharat Digital Mission) FHIR R4 interoperability standards**.

---

## 🌟 The Unified Experience

AarogyaDamu is engineered as **two interconnected interfaces belonging to one healthcare platform**:

1. **Mobile Application (Patient & Caregiver Companion)**:
   - **Patients**: 3-stage interactive onboarding, glucose logging with meal context (fasting, pre-meal, post-meal, bedtime), ADA color-coded indicators, longitudinal journey stages, daily care tasks, and personalized Damu AI guidance.
   - **Caregivers**: Real-time dependent health monitoring, active consent scope badges, delegated care plan activities, and appointment coordination.
   - **Doctors (on Mobile)**: Quick-triage command center, active patient roster, glycemic risk tiers, and clinical note summaries on the go.

2. **Web Application (Doctor Workstation)**:
   - **Clinician Workstation**: Dedicated slate/emerald command center exclusively for approved doctors.
   - **Patient Roster**: Filter by risk tier (**High Risk**, **In-Target**, **Low Risk**), adherence rates, and overdue reviews.
   - **NEO Ambient Scribe**: In-clinic ambient audio recording with AI-powered SOAP clinical note generation and doctor approval workflow.
   - **Shared Care Plan Studio**: Goal formulation, activity scheduling with caregiver delegation flags, and immutable versioning (v1, v2).
   - **Consultation Prep & Timeline**: Longitudinal glycemic trend charts and consolidated clinical history.

---

## 🏗️ Repository Architecture

```
aarogyadamu-project3/
├── packages/
│   └── contracts/         # Shared clinical tokens, ADA ranges, Zod schemas, FHIR types
├── services/
│   └── api/               # Express + Prisma + SQLite backend, JWT auth, Scribe, Audit logs
├── apps/
│   ├── web/               # Clinician Workstation & Web Portal (Vite + React + Tailwind)
│   └── mobile/            # Patient & Caregiver Companion (React Native + Expo Router)
├── docs/                  # UI/UX Audit, Pilot Readiness Audit, Runbooks
└── tests/
    └── integration/       # Cross-workspace integration tests (Vitest)
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Install Dependencies & Generate Database
```bash
# Install dependencies across all workspaces
npm install

# Generate Prisma Client & Run SQLite Migrations
npm run db:generate
npm run db:migrate

# Seed Synthetic Pilot Clinical Records
npm --workspace=services/api run prisma:seed
```

### 3. Launch Development Servers

You can launch each workspace independently or simultaneously:

```bash
# 1. Start the API Server (Port 4000)
npm run dev:api

# 2. Start the Doctor Web Workstation (Port 5173)
npm run dev:web

# 3. Start the Patient & Caregiver Mobile Companion (Port 8081)
npm run dev:mobile
```

---

## 👥 Evaluator Personas (1-Click Demo Logins)

The platform comes pre-seeded with three realistic clinical personas with password `DemoPassword123!`:

| Persona | Role | Email | Capabilities & Flow |
|---------|------|-------|---------------------|
| **Dr. Anjali Kulkarni** | Clinician | `dr.kulkarni@aarogyadamu.local` | Accesses **Doctor Workstation**: Patient Roster, Risk Tiers, Care Plan Studio, NEO Ambient Scribe, Consultation Prep. |
| **Ramesh Deshmukh** | Patient | `demo.patient1@aarogyadamu.local` | Accesses **Patient Companion**: Glucose logs, Journey Navigator, Daily Agenda, Caregiver Consent Grants. |
| **Meera Joshi** | Caregiver | `meera.joshi@family.aarogyadamu.local` | Accesses **Caregiver Connect**: Monitors dependent (Ramesh), views glucose trends, completes delegated medication tasks. |

> 💡 **Tip:** Both Web and Mobile auth screens feature **1-click Persona Demo Buttons** to instantly log in as Doctor, Patient, or Caregiver without manual typing.

---

## 🧪 Testing & Verification

The test suite validates authentication, role separation, ABDM consent boundaries, appointment concurrency, care plan immutability, and ambient scribe workflows.

```bash
# Run the complete test suite (Jest 7 suites + Vitest integration)
npm run test:api
```

**Results:**
- `src/__tests__/pilot_e2e_lifecycle.test.ts`: **14 / 14 passed**
- `src/__tests__/caregiver_doctor.test.ts`: **9 / 9 passed**
- `src/__tests__/coordination.test.ts`: **5 / 5 passed**
- `src/__tests__/scribe.test.ts`: **8 / 8 passed**
- `src/__tests__/journey.test.ts`: **7 / 7 passed**
- `src/__tests__/careplan.test.ts`: **6 / 6 passed**
- `src/__tests__/api.test.ts`: **7 / 7 passed**
- `tests/integration/api.test.ts`: **2 / 2 passed**
- **Total: 59 / 59 passed (100% Green)**

```bash
# Compile and build all workspaces
npm run build
```

---

## 🔒 Security & Clinical Compliance

1. **Role-Based Isolation**: Clinicians and patients have strictly separated shells. Clinician administrative and scribe controls are inaccessible to patient sessions.
2. **ABDM Consent Architecture**: Caregiver access is strictly gated by patient-issued active consent tokens with granular permissions (`VIEW_OBSERVATIONS`, `MANAGE_TASKS`, `MANAGE_CONSULTATIONS`). Revoking consent immediately terminates caregiver access.
3. **Audit Trails**: All clinical actions, appointments, scribe approvals, and password reset requests generate immutable records in the `AuditLog` table.
4. **ADA Standards of Care**:
   - Fasting Target: **80 – 130 mg/dL**
   - Post-Meal Target: **< 180 mg/dL**
   - Hypoglycemia Alert: **< 70 mg/dL** (Severe: **< 54 mg/dL**)
   - Hyperglycemia Alert: **> 250 mg/dL**
