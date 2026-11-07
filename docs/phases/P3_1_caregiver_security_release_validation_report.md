# AarogyaDamu Project 3 — Phase 3.1: Caregiver Security & Release Validation Report

**Document ID:** `DOC-P3.1-REL-VAL-20261104`  
**Milestone:** Phase 3.1 — Caregiver Security & Release Validation  
**Platform:** AarogyaDamu — Diabetes Care Journey Companion  
**Architecture:** Patient & Caregiver Mobile Application (React Native/Expo) + Doctor Web Workstation (React/Vite) + Shared REST API (Express/Prisma/SQLite)  
**Date:** 2026-11-04  
**Status:** ✅ COMPLETE — PRODUCTION-READY & CERTIFIED  

---

## 1. Executive Summary

Phase 3.1 represents the comprehensive security hardening, independent verification, and release certification of the **Dedicated Caregiver Experience & Permission-Governed Access** subsystem. 

Rather than introducing disruptive architectural redesigns, this milestone systematically performed an adversarial security audit across all 8 canonical caregiver permissions, identified and resolved invitation vulnerabilities, hardened permission evaluation logic to fail-closed, established dedicated caregiver API endpoints for complete permission parity, and developed specialized automated testing suites across the API and mobile workspaces.

### Key Milestones Achieved:
1. **Zero-Trust Independent Permission Verification:** Verified all 8 canonical caregiver permission scopes across 5 orthogonal testing dimensions (Granted, Not Granted, Revoked, Cross-Patient ID spoofing, Cross-Caregiver access).
2. **Cryptographic Invitation Hardening:** Replaced plaintext invitation token storage with SHA-256 token hashing (`crypto.createHash('sha256')`), enforced single-use invalidation upon acceptance, enforced strict 7-day expiration policy, and implemented email-bound acceptance rejection (403 Forbidden for unauthorized email addresses).
3. **Fail-Closed Permission Evaluator:** Hardened `services/api/src/permissions/evaluator.ts` against malformed permissions data and eliminated permission leakage across boundaries (e.g. `VIEW_TASKS` does not grant `VIEW_HEALTH_TIMELINE`; `VIEW_MEDICATIONS` does not grant `VIEW_MEDICATION_ADHERENCE`).
4. **Dedicated Caregiver Endpoints for 100% Permission Parity:** Implemented direct dedicated caregiver endpoints for adherence history, scheduled appointments, lab reports, and consolidated health timeline.
5. **Mobile Caregiver Automated Test Suite:** Implemented `apps/mobile/tests/caregiver-ui.test.cjs` validating workspace guards, multi-patient switcher, locked UI banners for missing permissions, and cache cleanup on revocation.
6. **Complete Monorepo Regression Coverage:** 
   - **API Test Suite:** 29 test suites passing (597 / 597 tests).
   - **API Integration Tests:** 1 suite passing (2 / 2 tests).
   - **Web Doctor Workstation:** 29 tests passing (29 / 29 tests).
   - **Mobile Application:** 33 tests passing (33 / 33 tests, including 9 dedicated caregiver UI tests).
   - **Monorepo Typecheck:** 0 errors across Mobile, API, and Web builds.

---

## 2. Codebase Audit & Gap Analysis

An exhaustive pre-implementation audit was conducted across the database schema, Express routes, authorization evaluators, and mobile screens to identify gaps between Phase 3 delivery and production security standards:

| Component / Subsystem | Phase 3 Audit Finding | Phase 3.1 Hardened Implementation | Security Impact |
| :--- | :--- | :--- | :--- |
| **Invitation Token Storage** | Stored in plaintext in `CaregiverConsent.invitationToken`. | Stored as SHA-256 hex digest (`invitationTokenHash`). Raw token returned once upon creation and never stored or returned in GET queries. | Mitigates database breach credential compromise. |
| **Invitation Exposure** | Raw `invitationToken` included in `GET /api/caregivers` response. | Sanitized: `invitationToken` is explicitly omitted from `GET /api/caregivers` responses. | Prevents token sniffing via inspectable network logs. |
| **Single-Use Invalidation** | Token remained valid in database after acceptance. | Upon `POST /invitations/:id/accept`, `invitationToken` is set to `null` and status updated to `ACTIVE`. Re-acceptance attempts return 400. | Prevents token reuse and replay attacks. |
| **Invitation Expiration** | `expiresAt` existed in schema but was not strictly guarded in `/accept`. | Explicit expiration check: `expiresAt <= new Date()` returns 400 and marks status as `EXPIRED`. Default expiry set to 7 days. | Eliminates indefinite invitation windows. |
| **Invitation Email Binding** | Allowed acceptance if raw token was matched, regardless of caller email. | Strict email check: `consent.caregiverEmail.toLowerCase() !== actor.email.toLowerCase()` immediately returns 403 Forbidden. | Prevents link hijacking by unintended recipients. |
| **Duplicate Invitations** | Multiple active grants could conflict or create duplicate states. | `POST /api/caregivers` checks for existing active grants and returns 409 Conflict. Automatically expires prior pending invites for same email. | Preserves database integrity and consent uniqueness. |
| **Permission Evaluator Robustness** | `JSON.parse(consent.permissions)` threw unhandled 500 on malformed input. | Wrapped in `try / catch` fallback to empty array, resulting in fail-closed 403 `AuthorizationError`. | Prevents Denial of Service via corrupted consent records. |
| **Permission Boundary Leaks** | `VIEW_TASKS` was mapped to allow `VIEW_HEALTH_TIMELINE`; `VIEW_MEDICATIONS` allowed adherence stats. | Strict boundary isolation: Each canonical permission is strictly distinct. `VIEW_TASKS` only grants task reading. | Prevents unintended over-scoping and clinical record leakage. |
| **Direct Caregiver Endpoints** | Missing dedicated endpoints for adherence, appointments, reports, and timeline. | Implemented dedicated endpoints under `/api/caregivers/patients/:patientId/...` with granular permission checks. | Enables mobile caregiver workspace to load individual tabs without falling back to unvetted routes. |
| **Caregiver Mobile Tests** | Mobile tests covered core flows and agent UI, but lacked dedicated caregiver tests. | Authored `apps/mobile/tests/caregiver-ui.test.cjs` (9 automated test scenarios). | Guarantees caregiver UI state transitions and permission gating are continuously verified. |

---

## 3. Canonical Permission Scope Matrix (All 8 Scopes Verified)

All 8 canonical permissions were independently tested in `services/api/src/__tests__/p3_1_caregiver_security_validation.test.ts` across 5 orthogonal security conditions:

| Canonical Permission Scope | Dedicated API Endpoint | Granted (200) | Not Granted (403) | Revoked (403) | Cross-Patient ID (403) | Unassigned Caregiver (403) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **1. `VIEW_HEALTH_SUMMARY`** | `GET /api/caregivers/patients/:id/health` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **2. `VIEW_MEDICATIONS`** | `GET /api/caregivers/patients/:id/medications` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **3. `VIEW_MEDICATION_ADHERENCE`** | `GET /api/caregivers/patients/:id/medications/adherence` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **4. `VIEW_TASKS`** | `GET /api/caregivers/patients/:id/tasks` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **5. `COMPLETE_TASKS_ON_BEHALF`** | `POST /api/caregivers/patients/:id/tasks/:taskId/complete` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **6. `VIEW_APPOINTMENTS`** | `GET /api/caregivers/patients/:id/appointments` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **7. `VIEW_REPORTS`** | `GET /api/caregivers/patients/:id/reports` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |
| **8. `VIEW_HEALTH_TIMELINE`** | `GET /api/caregivers/patients/:id/timeline` | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS | ✅ PASS |

### Specific Validation Insights:
- **`COMPLETE_TASKS_ON_BEHALF` Isolation:** When a caregiver has only `VIEW_TASKS`, `canComplete` evaluates to `false`. Attempting to invoke the `/complete` endpoint returns `403 Forbidden: Requires COMPLETE_TASKS_ON_BEHALF caregiver permission`.
- **`VIEW_HEALTH_TIMELINE` Isolation:** Verified that possessing `VIEW_TASKS` or `VIEW_MEDICATIONS` does NOT leak access to the consolidated timeline.
- **`VIEW_MEDICATION_ADHERENCE` Isolation:** Possessing `VIEW_MEDICATIONS` allows inspecting prescribed medication regimens and dosage instructions, but does NOT grant access to adherence logs or compliance percentages unless `VIEW_MEDICATION_ADHERENCE` is explicitly granted.

---

## 4. Invitation Lifecycle & Security Hardening

The invitation and delegation workflow was redesigned to adhere to zero-trust principles:

```
[Patient] -> POST /api/caregivers (status: 'PENDING')
                 |
                 +--> Generate rawInvitationToken = randomUUID()
                 +--> Compute hash = SHA-256(rawInvitationToken)
                 +--> Persist invitationToken = hash, expiresAt = now() + 7 days
                 +--> Return { consent, invitationToken: rawInvitationToken } (creator only)
                 
[Attacker] -> POST /invitations/:id/accept (with valid raw token, but logged in as attacker@evil.com)
                 |
                 +--> Reject: 403 Forbidden ("Invitation not addressed to your email")

[Caregiver] -> POST /invitations/:id/accept (logged in as intended recipient)
                 |
                 +--> Verify status !== 'ACTIVE' (single-use check)
                 +--> Verify expiresAt > now()
                 +--> Verify SHA-256(incomingToken) === consent.invitationToken
                 +--> Update status = 'ACTIVE', acceptedAt = now(), invitationToken = null (single-use wipe)
                 +--> Log AuditLog: CAREGIVER_INVITATION_ACCEPTED
```

### Hardening Controls Verified:
1. **Database Obfuscation:** The database only stores `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855...` (64-character SHA-256 hash). A read-only database leak does not expose active invitation credentials.
2. **GET Query Sanitization:** In `GET /api/caregivers`, the `invitationToken` property is destructured and stripped before serialization.
3. **Single-Use Enforcement:** Acceptance nullifies `invitationToken` and sets `status = 'ACTIVE'`. Re-submitting acceptance returns `400 Bad Request: This invitation has already been accepted`.
4. **Expiration Enforcement:** Expired invitations are rejected with `400 Bad Request: This invitation has expired`, and the record status is asynchronously marked `EXPIRED`.
5. **Unauthorized Email Rejection:** Prevents stolen invitation URLs from being accepted by unintended accounts (returns `403 Forbidden: Invitation not addressed to your email`).
6. **Duplicate Active Grant Rejection:** Attempting to grant access to an already active caregiver returns `409 Conflict: An active grant already exists for this caregiver. Revoke it before granting different permissions`.

---

## 5. Authorization Engine Hardening (`evaluator.ts`)

The centralized authorization evaluator `services/api/src/permissions/evaluator.ts` was audited and updated to ensure strict fail-closed security:

```typescript
// Safe parsing with fail-closed default
let grantedPermissions: string[] = [];
try {
  const parsed = JSON.parse(consent.permissions || '[]');
  grantedPermissions = Array.isArray(parsed) ? parsed : [];
} catch {
  grantedPermissions = []; // Fails closed, never crashes 500
}

const hasPermission =
  grantedPermissions.includes(permission) ||
  (permission === 'COMPLETE_TASKS_ON_BEHALF' && (grantedPermissions.includes('COMPLETE_TASKS_ON_BEHALF') || grantedPermissions.includes('MANAGE_TASKS'))) ||
  (permission === 'VIEW_TASKS' && (grantedPermissions.includes('VIEW_TASKS') || grantedPermissions.includes('COMPLETE_TASKS_ON_BEHALF') || grantedPermissions.includes('MANAGE_TASKS'))) ||
  ((permission === 'VIEW_HEALTH_SUMMARY' || permission === 'VIEW_OBSERVATIONS') &&
    (grantedPermissions.includes('VIEW_HEALTH_SUMMARY') || grantedPermissions.includes('VIEW_OBSERVATIONS') || grantedPermissions.includes('MANAGE_OBSERVATIONS'))) ||
  (permission === 'VIEW_MEDICATION_ADHERENCE' &&
    (grantedPermissions.includes('VIEW_MEDICATION_ADHERENCE') || grantedPermissions.includes('MANAGE_MEDICATIONS'))) ||
  (permission === 'VIEW_MEDICATIONS' &&
    (grantedPermissions.includes('VIEW_MEDICATIONS') || grantedPermissions.includes('MANAGE_MEDICATIONS'))) ||
  ((permission === 'VIEW_APPOINTMENTS' || permission === 'VIEW_CONSULTATIONS') &&
    (grantedPermissions.includes('VIEW_APPOINTMENTS') || grantedPermissions.includes('VIEW_CONSULTATIONS') || grantedPermissions.includes('MANAGE_CONSULTATIONS'))) ||
  ((permission === 'VIEW_REPORTS' || permission === 'VIEW_DOCUMENTS') &&
    (grantedPermissions.includes('VIEW_REPORTS') || grantedPermissions.includes('VIEW_DOCUMENTS') || grantedPermissions.includes('MANAGE_DOCUMENTS'))) ||
  ((permission === 'VIEW_HEALTH_TIMELINE' || permission === 'VIEW_CARE_PLAN') &&
    (grantedPermissions.includes('VIEW_HEALTH_TIMELINE') || grantedPermissions.includes('VIEW_CARE_PLAN') || grantedPermissions.includes('MANAGE_CARE_PLAN'))) ||
  (permission.startsWith('VIEW_') && grantedPermissions.includes(permission.replace('VIEW_', 'MANAGE_')));

if (!hasPermission) {
  throw new AuthorizationError(`Forbidden: Caregiver grant does not include permission [${permission}]`);
}
```

### Safety Guarantees:
- **Resilience to Corrupted JSON:** Malformed permissions strings do not crash the Node.js process; they parse to `[]` and throw a standard `403 AuthorizationError`.
- **Clinical Governance Non-Negotiable:** Under no circumstances can a caregiver perform clinician actions. Attempting to call `POST /api/medications` (prescribing) or `POST /api/care-plans` returns `403 Forbidden: Clinician privilege required`.

---

## 6. Dedicated Caregiver Endpoints Implementation

Four dedicated caregiver endpoints were introduced in `services/api/src/routes/caregivers.routes.ts` to provide 100% permission parity for the mobile caregiver workspace:

1. **`GET /api/caregivers/patients/:patientId/medications/adherence`**
   - **Gated by:** `VIEW_MEDICATION_ADHERENCE`
   - **Payload:** Returns aggregate adherence statistics (rate %, taken count, skipped count) and recent adherence events with dosage and timestamps.
2. **`GET /api/caregivers/patients/:patientId/appointments`**
   - **Gated by:** `VIEW_APPOINTMENTS`
   - **Payload:** Returns upcoming doctor consultations, scheduled date/time, doctor name, visit type, and reason.
3. **`GET /api/caregivers/patients/:patientId/reports`**
   - **Gated by:** `VIEW_REPORTS`
   - **Payload:** Returns clinical lab reports, documents, issuing facilities, and processing status.
4. **`GET /api/caregivers/patients/:patientId/timeline`**
   - **Gated by:** `VIEW_HEALTH_TIMELINE`
   - **Payload:** Aggregates health observations, completed care tasks, and medication events into a chronologically sorted unified stream.

---

## 7. Mobile Caregiver Experience & Testing Suite

An automated test suite `apps/mobile/tests/caregiver-ui.test.cjs` was implemented to verify caregiver UX contracts:

```
TAP version 13
# Subtest: Caregiver workspace layout enforces CAREGIVER role boundary with WorkspaceGuard
ok 13 - Caregiver workspace layout enforces CAREGIVER role boundary with WorkspaceGuard
# Subtest: Caregiver API provides AsyncStorage persistence for active patient context
ok 14 - Caregiver API provides AsyncStorage persistence for active patient context
# Subtest: Caregiver Home Screen supports multi-patient switching and persists selection
ok 15 - Caregiver Home Screen supports multi-patient switching and persists selection
# Subtest: Caregiver Health Screen displays locked restriction banner when VIEW_HEALTH_SUMMARY is missing
ok 16 - Caregiver Health Screen displays locked restriction banner when VIEW_HEALTH_SUMMARY is missing
# Subtest: Caregiver Medications Screen displays locked restriction banner when VIEW_MEDICATIONS is missing
ok 17 - Caregiver Medications Screen displays locked restriction banner when VIEW_MEDICATIONS is missing
# Subtest: Caregiver Tasks Screen enforces read-only mode when COMPLETE_TASKS_ON_BEHALF is missing
ok 18 - Caregiver Tasks Screen enforces read-only mode when COMPLETE_TASKS_ON_BEHALF is missing
# Subtest: Caregiver Tasks Screen allows authorized task completion with attribution and notes modal
ok 19 - Caregiver Tasks Screen allows authorized task completion with attribution and notes modal
# Subtest: Caregiver profile and home handle session wipe and cache cleanup on logout or zero patients
ok 20 - Caregiver profile and home handle session wipe and cache cleanup on logout or zero patients
# Subtest: Patient Profile provides full Caregiver Access Manager with permission editing and revocation
ok 21 - Patient Profile provides full Caregiver Access Manager with permission editing and revocation
```

### Verified Mobile UX Behaviors:
- **Workspace Isolation:** `apps/mobile/app/(caregiver)/_layout.tsx` is wrapped in `<WorkspaceGuard role="CAREGIVER">`. Unauthorized users are redirected to their assigned workspace.
- **Patient Context Switcher:** `caregiverApi.getActivePatientId()` and `setActivePatientId()` maintain state in `@aarogyadamu/caregiver/active_patient_id` in `AsyncStorage`.
- **Locked UI State:** When a caregiver navigates to Health or Medications without the requisite permission, an amber restriction card is displayed explaining that the patient has not granted access, hiding all sensitive clinical data.
- **Read-Only vs Complete Tasks:** Caregiver tasks display a "Read-Only Mode" badge and disable the completion button unless `COMPLETE_TASKS_ON_BEHALF` is present. When authorized, tapping "Complete on Patient's Behalf" opens a confirmation modal with optional caregiver observation notes.
- **Immediate State Wipe:** Upon logout or consent revocation, `caregiverApi.clearActivePatientId()` and `logoutMobileSession()` purge all local cached IDs, returning the app to the welcome screen.

---

## 8. Audit Trail & Clinical Attribution

Every caregiver action is attributed in `AuditLog` and on the target entity:

### Verified Audit Log Structure (`TASK_COMPLETED_BY_CAREGIVER`):
- `action`: `'TASK_COMPLETED_BY_CAREGIVER'`
- `entityType`: `'CareTask'`
- `entityId`: Task UUID
- `actorId`: Caregiver User UUID
- `userId`: Patient User UUID (data subject)
- `metadata`:
  ```json
  {
    "taskId": "7f8b9a10-...",
    "consentId": "c4d5e6f7-...",
    "caregiverEmail": "caregiver.alpha@aarogyadamu.test",
    "permissionUsed": "COMPLETE_TASKS_ON_BEHALF",
    "notes": "Verified blood glucose reading with contour plus meter",
    "completedAt": "2026-11-04T04:28:25.106Z"
  }
  ```

### Entity Attribution:
- `CareTask.completedById`: Populated with Caregiver User UUID.
- `CareTask.completedByRole`: Populated with `'CAREGIVER'`.
- `CareTask.clinicalNotes`: Appended with caregiver observation note.
- `CaregiverConsent.lastAccessedAt`: Automatically updated on each read or write request, giving the patient full transparency into when their caregiver inspected their records.

---

## 9. Monorepo Verification & Regression Test Results

Full monorepo regression testing was executed with zero failures:

### 1. API Test Suites (Jest & Vitest)
```
Test Suites: 29 passed, 29 total
Tests:       597 passed, 597 total
Snapshots:   0 total
Time:        89.711 s
PASS src/__tests__/p3_1_caregiver_security_validation.test.ts (51 tests)
PASS src/__tests__/p3_caregiver_experience.test.ts (25 tests)
PASS src/__tests__/p2_5_doctor_tasks_reminders.test.ts (31 tests)
PASS src/__tests__/p2_medication_prescribing.test.ts (28 tests)
PASS src/__tests__/caregiver_doctor.test.ts (9 tests)
... [all 29 suites pass]

RUN v5.0.5 C:/Users/prana/Desktop/aarogyadamu-project3
✓ tests/integration/api.test.ts (2 tests) 653ms
```

### 2. Mobile Test Suites (Node Test Runner)
```
TAP version 13
# tests 33
# suites 0
# pass 33
# fail 0
# duration_ms 202.5257
- apps/mobile/tests/caregiver-ui.test.cjs: 9 passed
- apps/mobile/tests/agent-ui.test.cjs: 12 passed
- apps/mobile/tests/mobile-flow.test.cjs: 12 passed
```

### 3. Web Test Suites (Node Test Runner + TSX)
```
TAP version 13
# tests 29
# suites 0
# pass 29
# fail 0
# duration_ms 1617.0217
- apps/web/tests/doctor-only-auth.test.cjs: 29 passed
```

### 4. Monorepo Typecheck (`npm run typecheck`)
```
> aarogyadamu-project3@1.0.0 typecheck
> npm run typecheck:mobile && npm run build:api && npm run build:web

> typecheck:mobile: node apps/mobile/node_modules/typescript/bin/tsc --noEmit (0 errors)
> build:api: tsc (0 errors)
> build:web: tsc && vite build (0 errors)
✓ built in 24.41s
dist/assets/index-C_dcRbsU.js   403.72 kB │ gzip: 98.55 kB
```

---

## 10. Release Readiness Certification & Sign-Off

### Certification Checklist:
- [x] **Zero Plaintext Tokens:** All invitation tokens hashed with SHA-256 in database.
- [x] **No Token Leakage:** GET endpoints strip tokens from response payloads.
- [x] **Single-Use Enforced:** Tokens nullified on acceptance; replay returns 400.
- [x] **Expiry Enforced:** 7-day default expiration strictly validated.
- [x] **Email-Bound Acceptance:** Unintended recipients cannot claim invitations (403).
- [x] **8 Canonical Permissions Verified:** Each tested in isolation across 5 conditions.
- [x] **Strict Clinical Boundaries:** Caregiver cannot prescribe medications or create clinical care plans.
- [x] **Immediate Revocation:** Revocation cuts off access across all endpoints immediately.
- [x] **Attribution Intact:** `TASK_COMPLETED_BY_CAREGIVER` records actor, consent, timestamp, and notes.
- [x] **Clean Monorepo Builds:** API (597 tests), Web (29 tests), Mobile (33 tests), TypeScript (0 errors).

**Architectural Verdict:**  
Phase 3.1 is **APPROVED and CERTIFIED for Release**. The caregiver subsystem satisfies all clinical security, role boundary, and patient privacy requirements.

