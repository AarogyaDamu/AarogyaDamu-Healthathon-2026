# AarogyaDamu — Diabetes Care Journey Companion
### Health-a-thon 2026 — Project 3 (Repository Cleanup & P0 Preparation)

> **AarogyaDamu** is an intelligent diabetes care companion platform built with clinical rigor adhering to **ADA (American Diabetes Association) Standards of Care** and **FHIR R4 semantic interoperability specifications**.

---

## 🌟 Architecture & Interface Separation

AarogyaDamu maintains a strict **two-product, role-isolated architecture**:

1. **Mobile Application (`apps/mobile`) — Patient & Caregiver Companion**:
   - **Target Users**: Patients living with diabetes and authorized family caregivers only.
   - **Patient Features**: 3-stage interactive onboarding, glucose logging with meal context (fasting, pre-meal, post-meal, bedtime), ADA color-coded indicators, longitudinal journey stages, daily care tasks, and personalized Damu AI guidance.
   - **Caregiver Features**: Real-time dependent health monitoring, active consent scope badges, delegated care plan activities, and appointment coordination.
   - **Isolation Guarantee**: Doctor login, clinician dashboards, and clinical note approval are strictly excluded from the mobile application.

2. **Web Application (`apps/web`) — Doctor Workstation**:
   - **Target Users**: Approved clinicians and endocrinologists only.
   - **Clinician Workstation**: Dedicated command center with patient roster filtering by risk tier (**High Risk**, **In-Target**, **Low Risk**), adherence rates, and overdue reviews.
   - **NEO Ambient Scribe**: In-clinic ambient audio transcription workflow with AI-assisted SOAP clinical note generation and doctor approval flow.
   - **Shared Care Plan Studio**: Goal formulation, activity scheduling with caregiver delegation flags, and immutable versioning (v1, v2).
   - **Consultation Prep & Timeline**: Longitudinal glycemic trend charts and consolidated clinical history.
   - **Isolation Guarantee**: Patient and caregiver workflows are strictly excluded from the clinician web application.

---

## 🏗️ Repository Structure

```
aarogyadamu-project3/
├── apps/
│   ├── mobile/            # Patient & Caregiver Companion (React Native + Expo Router)
│   └── web/               # Clinician Workstation (React + Vite + Tailwind CSS)
├── packages/
│   └── contracts/         # Shared clinical tokens, ADA ranges, Zod schemas, FHIR types
├── services/
│   └── api/               # Express + Prisma + SQLite backend, JWT auth, Scribe, Audit logs
├── docs/
│   ├── audits/            # Security, Pilot Readiness, and UI/UX audit reports
│   ├── phases/            # Historical phase plans and milestone implementation reports
│   ├── runbooks/          # Operational runbooks and backup procedures
│   └── repository_cleanup_report.md
└── tests/
    ├── e2e/               # Browser acceptance and end-to-end suites
    └── integration/       # Cross-workspace integration tests (Vitest)
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.x LTS or higher
- **npm**: v10.x or higher

### 2. Install Dependencies & Generate Database
```bash
# Install dependencies across all workspaces
npm install

# Generate Prisma Client & Apply SQLite Migrations
npm run db:generate
npm run db:migrate

# Seed Synthetic Pilot Clinical Records
npm --workspace=services/api run prisma:seed
```

### 3. Launch Development Servers

Workspaces can be run independently or simultaneously:

```bash
# 1. Start the API Server (Port 4000)
npm run dev:api

# 2. Start the Doctor Web Workstation (Port 5173)
npm run dev:web

# 3. Start the Patient & Caregiver Mobile Companion (Port 8081)
npm run dev:mobile
```

---

## 👥 Evaluator Personas (Local Development Only)

The local development database can be seeded with synthetic evaluation profiles (`DemoPassword123!`):

| Persona | Role | Email | Target Application | Capabilities & Flow |
|---------|------|-------|--------------------|---------------------|
| **Dr. Anjali Kulkarni** | Clinician | `dr.kulkarni@aarogyadamu.local` | **Doctor Web Workstation** (`apps/web`) | Patient Roster, Risk Tiers, Care Plan Studio, NEO Ambient Scribe, Consultation Prep. |
| **Ramesh Deshmukh** | Patient | `demo.patient1@aarogyadamu.local` | **Mobile Companion** (`apps/mobile`) | Glucose logs, Journey Navigator, Daily Agenda, Caregiver Consent Grants. |
| **Meera Joshi** | Caregiver | `meera.joshi@family.aarogyadamu.local` | **Mobile Companion** (`apps/mobile`) | Dependent monitoring, glucose trends, delegated medication tasks. |

> ⚠️ **Security Notice:** Demo authentication and synthetic seed accounts are strictly restricted to local development environments (`ENABLE_DEV_DEMO_MODE=true` and `ALLOW_DEMO_AUTH=true`). They are automatically blocked and rejected in production environments. Doctor registration in production strictly requires a verified, one-time invitation token issued by an administrator.

---

## 🧪 Testing & Verification

The test suite validates authentication, role separation, consent boundaries, appointment concurrency, care plan immutability, session restoration, and ambient scribe workflows.

```bash
# Run API test suite (Jest 11 suites + Vitest integration)
npm run test:api

# Run Web test suite (Doctor-only auth, session UX, concurrent refresh)
npm --workspace=apps/web run test

# Run Mobile test suite (Onboarding, session restoration, role routing)
npm --workspace=apps/mobile run test

# Compile and build production bundles
npm run build
```

**Baseline Test Verification Summary:**
- **API Unit & Security Tests (Jest)**: 11 suites, 83 tests passing (100% Green)
- **Integration Tests (Vitest)**: 1 suite, 2 tests passing (100% Green)
- **Doctor Web Workstation Tests (Node Test Runner)**: 8 tests passing (100% Green)
- **Mobile Companion Tests (Node Test Runner)**: 6 tests passing (100% Green)
- **Total**: 99 automated tests passing across workspaces

---

## 📊 Feature Status & Roadmap

| Feature Area | Status | Implementation Details |
|--------------|--------|------------------------|
| **Doctor-Only Web Workstation** | Implemented | Dedicated slate/emerald UI, invitation-gated onboarding, session rotation. |
| **Patient & Caregiver Mobile App** | Implemented | Expo Router mobile app with role switching and WorkspaceGuard protection. |
| **Role Isolation & Session Security** | Implemented | HttpOnly refresh cookie rotation, CSRF token validation, server-side revocation. |
| **Care Coordination & Consent** | Implemented | ABDM-style consent grants (`VIEW_OBSERVATIONS`, `MANAGE_TASKS`), instant revocation. |
| **Shared Care Plans** | Implemented | Versioned care plans (v1, v2) with clinician approval and delegation flags. |
| **NEO Ambient Scribe (Local)** | Implemented | Audio chunk capture, structured SOAP note generation, clinician review. |
| **FHIR R4 Semantic Export** | Implemented | Standard Observation bundle generation for health records. |
| **Live ABDM Sandbox Gateway** | Planned (P0) | Direct integration with ABDM Milestone 1-3 M1/M2/M3 national health network. |
| **Hardware CGM / Glucometer Sync** | Planned (P0) | Bluetooth LE device integration for continuous blood glucose streaming. |
| **Production SMS/WhatsApp Alerts** | Planned (P0) | Direct SMS gateway for high/low glucose emergency escalation. |

---

## 🔒 Security & Clinical Compliance

1. **Role-Based Isolation**: Clinicians and patients have strictly separated shells. Clinician administrative and scribe controls are inaccessible to patient sessions.
2. **Consent-Gated Data Access**: Caregiver access is strictly gated by patient-issued active consent tokens with granular scopes (`VIEW_OBSERVATIONS`, `MANAGE_TASKS`, `MANAGE_CONSULTATIONS`). Revoking consent immediately terminates caregiver access.
3. **Audit Trails**: All clinical actions, appointments, scribe approvals, and password reset requests generate immutable records in the `AuditLog` table.
4. **ADA Standards of Care**:
   - Fasting Target: **80 – 130 mg/dL**
   - Post-Meal Target: **< 180 mg/dL**
   - Hypoglycemia Alert: **< 70 mg/dL** (Severe: **< 54 mg/dL**)
   - Hyperglycemia Alert: **> 250 mg/dL**
