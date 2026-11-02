# AarogyaDamu Project 3 — UI/UX & Full-Stack Audit Report

**Date:** 2026-10-31  
**Auditor:** Antigravity Phase 0 — Automated Repository Inspection  
**Scope:** Complete codebase — mobile, web, API, database, contracts, tests

---

## 1. Architecture Overview

| Layer | Technology | Path |
|-------|-----------|------|
| Mobile App | React Native + Expo Router + TypeScript | `apps/mobile/` |
| Web App | React + Vite + TailwindCSS + TypeScript | `apps/web/` |
| API Server | Express + Prisma + SQLite + TypeScript | `services/api/` |
| Shared Contracts | Zod validation schemas | `packages/contracts/` |
| Database | SQLite via Prisma ORM | `services/api/prisma/dev.db` |

### Monorepo Structure
- npm workspaces (`packages/*`, `services/*`, `apps/*`)
- Shared contracts package referenced via `file:` protocol
- Single API server on port 4000
- Web dev server on port 5173
- Mobile via Expo on port 8081

---

## 2. Mobile Application Audit

### 2.1 Route Structure (Expo Router)

| Route Group | Files | Status |
|-------------|-------|--------|
| `app/index.tsx` | Splash screen → auto-route | ✅ Working |
| `app/session-router.tsx` | Workspace chooser (multi-role) | ✅ Working |
| `app/(auth)/` | welcome, auth, role-selection, privacy, permissions, personal-profile | ✅ Screens exist |
| `app/(tabs)/` | Patient tab navigator (home, journey, ask-damu, appointments, profile + hidden: health, tasks, consultation) | ✅ Functional |
| `app/(doctor)/` | Doctor dashboard, patients, appointments, profile | ⚠️ Basic implementation |
| `app/(caregiver)/` | Caregiver dashboard, dependents, appointments, profile | ⚠️ Basic implementation |

### 2.2 UI/UX Issues — Mobile

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| M1 | **Inconsistent design language** — Doctor and Caregiver dashboards use raw inline styles with hardcoded colors (#EA580C, #0F172A, #64748B) instead of the theme system | Medium | `(doctor)/index.tsx`, `(caregiver)/index.tsx` |
| M2 | **No dedicated onboarding carousel** — Welcome screen jumps directly to privacy/auth. Missing intro slides explaining the app | Medium | `(auth)/welcome.tsx` |
| M3 | **Doctor dashboard is very basic** — Only 2 action cards ("My Patients", "Appointment Requests"). No metrics, no patient summaries, no search | High | `(doctor)/index.tsx` |
| M4 | **Caregiver dashboard is sparse** — Only 2 cards. No connected patient health summaries, no notifications | High | `(caregiver)/index.tsx` |
| M5 | **Doctor patient list has no tap navigation** — Patient cards show observation data but have no tap action to open a patient detail view | High | `(doctor)/patients.tsx` |
| M6 | **Password minimum validation mismatch** — Contracts require 12 chars, mobile auth.tsx requires 8 chars, web requires 8 chars | Medium | Multiple files |
| M7 | **Tab bar has 5 visible tabs + 3 hidden screens** — Hidden screens (health, tasks, consultation) are accessible only through programmatic navigation. Discoverability is poor | Medium | `(tabs)/_layout.tsx` |
| M8 | **No Health tab in bottom navigation** — Glucose logging is hidden inside the home dashboard quick actions. Key feature buried | High | `(tabs)/_layout.tsx` |
| M9 | **Placeholder appointment screens** — Doctor, caregiver, and patient appointments all delegate to a shared `AppointmentCenter` component which exists but is 19KB — functional | Low | Feature files |
| M10 | **No pull-to-refresh on home dashboard** — Patient home tab likely lacks refresh mechanism | Medium | `(tabs)/index.tsx` |
| M11 | **Role selection allows Doctor role during mobile onboarding** — But the doctor web app should be the primary doctor workspace. Mobile doctor mode is a secondary access point | Low | `(auth)/role-selection.tsx` |
| M12 | **No forgotten password flow** — Neither mobile nor web implement forgot password | High | All auth screens |

### 2.3 Design System — Mobile

The theme system exists at `apps/mobile/src/theme/index.ts` and provides:
- ✅ Colors (primary teal, accent orange, semantic colors)
- ✅ Typography sizes and line heights
- ✅ Spacing scale (xs through xxl)
- ✅ Border radii
- ✅ Touch targets
- ✅ Shadow presets

**Issues:**
- Not all screens use the theme (doctor/caregiver dashboards use hardcoded colors)
- No shared design tokens between mobile and web
- Web uses Tailwind utility classes with separate color definitions
- Font family not specified in mobile theme (uses system default)

### 2.4 Component Library — Mobile

| Component | Path | Status |
|-----------|------|--------|
| AppButton | `components/ui/AppButton.tsx` | ✅ Reusable |
| AppInput | `components/ui/AppInput.tsx` | ✅ Reusable |
| ToastProvider | `components/ui/ToastProvider.tsx` | ✅ Working |
| StateView | `components/ui/StateView.tsx` | ✅ Loading/Empty/Error states |
| CommandMenu | `components/ui/CommandMenu.tsx` | ✅ Exists |
| WorkspaceGuard | `src/features/coordination/WorkspaceGuard.tsx` | ✅ Role gating |
| AppointmentCenter | `src/features/coordination/AppointmentCenter.tsx` | ✅ Shared appointment UI |
| CaregiverConsentManager | `src/features/coordination/CaregiverConsentManager.tsx` | ✅ Consent UI |
| WorkspaceAccountScreen | `src/features/coordination/WorkspaceAccountScreen.tsx` | ✅ Profile |

---

## 3. Web Application Audit (Doctor Workspace)

### 3.1 Architecture

The web app is a **single-page React application** (`App.tsx` = 656 lines) with:
- Tab-based navigation via state string (`currentTab`)
- No React Router — all navigation is conditional rendering
- TailwindCSS v3 for styling
- 13 page components imported directly into App.tsx

### 3.2 UI/UX Issues — Web

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| W1 | **Web app is NOT a doctor workspace** — It's a combined patient/caregiver/doctor app in one. All tabs (Home, Journey, Care Plan, Doctor Hub, Caregiver, Sugar Checks, To-Do, Visit Prep, Ask Damu, Hypo Help, Profile) are visible to all users | Critical | `App.tsx`, `Navbar.tsx` |
| W2 | **No proper routing** — Uses string-based tab switching. No URL-based navigation. Cannot bookmark or share specific pages | High | `App.tsx` |
| W3 | **Monolithic App.tsx** — 656 lines containing auth, onboarding, notifications, tab routing, and app shell | Medium | `App.tsx` |
| W4 | **DoctorDashboard.tsx is 39KB** — Extremely large single component file | Medium | `pages/DoctorDashboard.tsx` |
| W5 | **PatientSwitcher shown to all users** — Header shows patient switcher regardless of role | Medium | `App.tsx` line 561 |
| W6 | **No role-based view separation** — Doctor, patient, and caregiver all see the same navigation and can switch between all tabs | Critical | `Navbar.tsx` |
| W7 | **Navbar has 11 tabs** — Too many navigation items, overwhelming UX | High | `Navbar.tsx` |
| W8 | **Password validation says 8 chars but contracts require 12** — Will cause silent registration failures | High | `App.tsx` line 163 |
| W9 | **Demo login hardcodes credentials** — Fallback sends `DemoPassword123!` which doesn't meet 12-char contract requirement but works because server validates with 8 | Medium | `App.tsx` line 192 |
| W10 | **No sidebar layout for doctor** — Uses horizontal tab bar. Professional doctor workspace should use a sidebar | High | `Navbar.tsx` |
| W11 | **Missing `.env` file** — Web app only has `.env.example`, no actual `.env` | Low | `apps/web/` |
| W12 | **React 18.3 in web vs React 19.3 in mobile** — Version mismatch | Medium | Package files |

### 3.3 Web Pages Inventory

| Page | File Size | Description |
|------|-----------|-------------|
| Home | 45.9 KB | Patient home dashboard |
| Health | 67.7 KB | Glucose tracking |
| Journey | 32.9 KB | Diabetes journey |
| Tasks | 23.5 KB | Care tasks |
| ConsultationPrep | 36.7 KB | Visit preparation |
| AskDamu | 28.0 KB | AI assistant |
| Profile | 15.9 KB | User profile |
| CarePlan | 33.3 KB | Care plan management |
| DoctorDashboard | 39.5 KB | Doctor workspace |
| CaregiverConnect | 27.8 KB | Caregiver management |
| EmergencyNav | 15.7 KB | Hypo emergency |
| Auth | 10.8 KB | Authentication (inline) |
| Timeline | 36.1 KB | Health timeline |

---

## 4. API Server Audit

### 4.1 Routes

| Route Module | Path Prefix | Status |
|-------------|-------------|--------|
| Auth Router | `/api/auth/*` | ✅ Inline in server.ts |
| Dashboard | `/api/dashboard` | ✅ Inline in server.ts |
| Observations | `/api/observations` | ✅ Inline in server.ts |
| Tasks | `/api/tasks` | ✅ Inline in server.ts |
| Documents | `/api/documents` | ✅ Inline in server.ts |
| Consultations | `/api/consultations` | ✅ Inline in server.ts |
| Profile | `/api/profile/*` | ✅ Inline in server.ts |
| Assistant | `/api/assistant/*` | ✅ External route file |
| Scribe | `/api/scribe/*` | ✅ External route file (24KB) |
| Coordination | `/api/coordination/*` | ✅ External route file (60KB) |
| Care Plans | `/api/care-plans/*` | ✅ External route file (34KB) |
| Journey | `/api/journey/*` | ✅ External route file (32KB) |
| Caregivers | `/api/caregivers/*` | ✅ External route file (5KB) |

### 4.2 API Issues

| # | Issue | Severity | Location |
|---|-------|----------|----------|
| A1 | **server.ts is 1758 lines** — Monolithic file with many routes inline | Medium | `server.ts` |
| A2 | **CORS is `origin: '*'`** — Wide open, should be restricted in production | High | `server.ts` line 51 |
| A3 | **JWT token doesn't include `isClinician` flag** — Registration creates token with only `id, email, isSyntheticDemo`. The `isClinician` flag is checked in middleware but not in token | Medium | `server.ts` line 122-126 |
| A4 | **No password reset endpoint** — No forgot password API | High | Missing |
| A5 | **SQLite database** — Single-file database, not suitable for multi-user production | Medium | `prisma/schema.prisma` |
| A6 | **Duplicate PrismaClient instances** — `middleware/auth.ts` creates its own `new PrismaClient()` instead of reusing the one from server.ts | Low | `middleware/auth.ts` |
| A7 | **Zod v4 migration needed** — npm audit forced zod to v4.6.7 which has breaking API changes from v3 | Critical | All validation |
| A8 | **Jest v25 installed** — npm audit forced jest to v25.1.0 which is very old and may break tests | High | `services/api/package.json` |
| A9 | **Vite v8 in API service** — Backend should not depend on Vite | Low | `services/api/package.json` |
| A10 | **Expo dependency in API service** — Backend depends on expo@53 which is unnecessary | Low | `services/api/package.json` |

### 4.3 Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| Authentication | ✅ | JWT-based, bcrypt password hashing |
| Authorization (RBAC) | ✅ | `resolvePatientContext` + `requireClinician` middleware |
| Data isolation | ✅ | Patient data scoped by userId |
| Caregiver consent | ✅ | Permission-based access with consent model |
| Input validation | ✅ | Zod schemas in contracts package |
| Rate limiting | ✅ | 600 req/15min |
| Security headers | ✅ | X-Content-Type-Options, X-Frame-Options, HSTS |
| Audit logging | ✅ | AuditLog model with user/actor/action tracking |
| CORS | ⚠️ | Open (`*`) — should restrict |
| Secret management | ⚠️ | Dev JWT secret committed in `.env` files |
| API keys | ✅ | Gemini/LLM/Sarvam keys empty, not committed |

---

## 5. Database Schema Assessment

### 5.1 Models (16 total)

| Model | Records Purpose | Relations |
|-------|----------------|-----------|
| User | Core identity | Central hub |
| PatientProfile | Clinical profile | 1:1 with User |
| HealthObservation | Glucose/vitals | Many:1 User |
| CareTask | Reminders/tasks | Many:1 User + CarePlan |
| HealthDocument | Lab reports | Many:1 User |
| ConsultationPrep | Visit preparation | Many:1 User |
| CaregiverConsent | Caregiver access grants | Many:1 User (patient) |
| AssistantProposal | Damu AI proposals | Many:1 User |
| MedicationSchedule | Medication tracking | Many:1 User |
| AuditLog | Security audit trail | Many:1 User |
| ConsultationNote | NEO Scribe notes | Many:1 User + clinician |
| DoctorPatientAssignment | Doctor-patient link | Many:Many User |
| Appointment | Shared appointments | Patient + Doctor + BookedBy |
| CarePlan | Diabetes care plans | Patient + Doctor + Approver |
| CarePlanGoal | Care plan targets | Many:1 CarePlan |
| CarePlanActivity | Care plan activities | Many:1 CarePlan |
| CareTeamMessage | Messaging | Patient + Sender + Recipient |
| CareNotification | Push notifications | Many:1 User |

**Assessment:** Schema is comprehensive and well-designed for the use case. Proper indices, relations, and cascade deletes.

---

## 6. Cross-Platform Integration Assessment

| Integration Point | Status | Notes |
|-------------------|--------|-------|
| Shared backend | ✅ | Both apps hit same API on port 4000 |
| Shared contracts | ✅ | Both import from `@aarogyadamu/contracts` |
| Auth tokens | ✅ | Same JWT format, stored differently (SecureStore vs localStorage) |
| Data synchronization | ⚠️ | No real-time sync. Manual refresh only |
| Patient data flow | ✅ | Single database, proper CRUD operations |
| Care plan updates | ✅ | Doctor creates via web, patient views on mobile |
| Observation flow | ✅ | Patient logs on mobile, doctor sees on web |

---

## 7. Test Coverage

| Test File | Lines | Description |
|-----------|-------|-------------|
| `api.test.ts` | 8.2 KB | Basic API endpoint tests |
| `caregiver_doctor.test.ts` | 27 KB | Caregiver/doctor workflow tests |
| `careplan.test.ts` | 14.9 KB | Care plan CRUD tests |
| `coordination.test.ts` | 8.7 KB | Coordination API tests |
| `journey.test.ts` | 16.6 KB | Journey feature tests |
| `pilot_e2e_lifecycle.test.ts` | 23.8 KB | End-to-end pilot lifecycle |
| `scribe.test.ts` | 18.9 KB | NEO Scribe tests |
| `integration/api.test.ts` | 1.8 KB | Basic integration test |

**Test runner status:** Jest v25 (forced by npm audit) may not run with current config. Vitest also available.

---

## 8. Build System Assessment

| Component | Build Command | Status |
|-----------|--------------|--------|
| API TypeScript | `tsc` | ⚠️ Needs verification |
| Web production | `tsc && vite build` | ⚠️ Needs verification |
| Mobile Expo | `expo start` | ⚠️ Needs verification |
| Prisma generation | `prisma generate` | ⚠️ Needs verification |

**Post-audit fix warning:** `npm audit fix --force` upgraded:
- Vite: → v8.3.5 (SemVer major)
- Vitest: → v5.0.5 (SemVer major)
- Zod: → v4.6.7 (SemVer major — **BREAKING**)
- Expo: → v53.0.11 (SemVer major)
- Jest: → v25.1.0 (SemVer major — **DOWNGRADE**)

---

## 9. Priority Findings Summary

### Critical (Must Fix)

1. **Web app is not role-separated** — Doctor sees patient tabs, patient sees doctor tabs. Must create a proper doctor-only workspace with sidebar navigation.
2. **Zod v4 breaking changes** — All validation schemas may fail. Zod v4 changed `.strict()` behavior and other APIs.
3. **Password validation mismatch** — Contracts say 12 chars, UI says 8 chars.

### High Priority

4. **Doctor dashboard (mobile) is barebones** — Needs metrics, patient summaries, proper workspace.
5. **Caregiver dashboard (mobile) is barebones** — Needs connected patient data, health summaries.
6. **No forgot password** — Neither frontend implements password reset.
7. **No proper URL routing on web** — String-based tab switching, no deep links.
8. **Mobile Health tab not in bottom nav** — Key glucose logging feature is buried.
9. **Jest v25 downgrade** — Test runner likely broken.
10. **CORS wide open** — Security risk.

### Medium Priority

11. Doctor/caregiver screens don't use theme system
12. No shared design tokens between mobile and web
13. React version mismatch (18 vs 19)
14. Monolithic server.ts (1758 lines)
15. No onboarding carousel slides
16. No pull-to-refresh on key screens

---

## 10. Recommended Implementation Order

1. **Fix Zod v4 compatibility** — Ensure all contracts compile and validate
2. **Create shared design system** — Design tokens shared between mobile and web
3. **Redesign web as doctor workspace** — Sidebar nav, role-based views, proper routing
4. **Enhance mobile patient dashboard** — Better home screen, add Health to bottom nav
5. **Enhance doctor mobile dashboard** — Add metrics, patient details navigation
6. **Enhance caregiver mobile dashboard** — Add patient health summaries
7. **Add onboarding carousel** — Mobile intro screens
8. **Fix authentication** — Password validation alignment, forgot password
9. **Fix test runner** — Get tests passing again
10. **Full integration testing** — Cross-platform data sync verification
11. **Pilot readiness checklist** — Production configuration, deployment docs
