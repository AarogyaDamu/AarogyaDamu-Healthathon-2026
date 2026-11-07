# Phase P0.7.4 Completion Report: Agent API Endpoints & Routes

**Project:** AarogyaDamu Project 3 — Diabetes Care Journey Companion  
**Phase:** P0.7 — Governed Agentic Execution  
**Sub-Phase:** P0.7.4 — Agent API Endpoints & Routes  
**Execution Timestamp:** 2026-11-03T13:35:00+05:30  
**Git Branch:** `cleanup-checkpoint`  
**Decision / Status:** `P0.7.4_COMPLETED — READY_FOR_INDEPENDENT_AUDIT`  
**Clinical Approval Status:** `PENDING_CLINICIAN_APPROVAL`  
**Feature Flag Status:**  
- `P0_7_AGENTIC_EXECUTION = false` (Disabled by default; fails closed with 403 `FEATURE_DISABLED`)  
- `P0_8_EXTERNAL_INTEGRATIONS = false` (Disabled)  

---

## 1. Executive Summary

Phase **P0.7.4 (Agent API Endpoints & Routes)** has been implemented and rigorously verified. This sub-phase exposes the governed Agent Runtime and Proposal Engine (P0.7.3) through secure, authenticated, schema-validated Express REST endpoints mounted at `/api/agent`.

The API architecture acts strictly as an enforcement gateway and thin presentation layer for the underlying governed runtime. No planning, authorization, confirmation, emergency evaluation, or tool execution logic is duplicated within route handlers; instead, route controllers delegate all operations to the canonical runtime services while enforcing HTTP-tier governance:
1. **Feature Flag Boundary:** All agent endpoints are guarded by `requireFeature('P0_7_AGENTIC_EXECUTION')`, failing closed with HTTP 403 `FEATURE_DISABLED` when disabled.
2. **Mandatory Authentication & Session-Derived Context:** Every endpoint requires `requireAuth`. Caller identity and role are strictly derived from verified JWT session claims (`req.user.id`, `req.user.role`). Client-side actor or role spoofing is impossible.
3. **Cross-Patient Tenant Isolation:** Target patient contexts are verified against active caregiver consent records; unauthorized access across patient boundaries is rejected with HTTP 403 `UNAUTHORIZED_ACTOR_ROLE`.
4. **Rate Limiting:** Guarded by `agentRateLimiter` (100 requests per 15-minute window per IP/user) to prevent brute-force confirmation and denial-of-service attempts.
5. **Strict Schema & Parameter Validation:** All input payloads are validated with Zod schemas (`AgentPlanRequestSchema`, `AgentActionConfirmRequestSchema`, `AgentActionCancelRequestSchema`, `AgentProposalReviewRequestSchema`). Path parameters are checked for strict UUID compliance.

---

## 2. API Endpoints Specification

All endpoints are mounted on Express under the `/api/agent` prefix:

| Endpoint | Method | Role & Scope | Description |
| :--- | :--- | :--- | :--- |
| `/api/agent/plan` | `POST` | `PATIENT`, `CAREGIVER` | Accepts validated user request, resolves authenticated patient context, checks emergency precedence and prohibited intents, generates a bounded plan (max 3 actions), and returns plan and action summaries. |
| `/api/agent/execute/:actionId` | `POST` | `PATIENT`, `CAREGIVER` | Explicit confirmation gateway. Validates action binding, checks plan version, evaluates spoken emergency cues, claims action conditionally, and executes tool idempotently. |
| `/api/agent/cancel/:actionId` | `POST` | `PATIENT`, `CAREGIVER` | Cancels an eligible pending action. Verifies ownership and logs audit record. |
| `/api/agent/proposals` | `GET` | `DOCTOR` (Assigned) | Doctor workstation view of pending clinical care proposals held in `PENDING_CLINICIAN_APPROVAL`. Requires active `DoctorPatientAssignment`. |
| `/api/agent/proposals/:actionId/clinician-review` | `POST` | `DOCTOR` (Assigned) | Clinician review gateway. Approves or rejects a proposal held for clinical review, enforcing active doctor-patient assignment and capturing clinical review notes. |
| `/api/agent/plans/:planId` | `GET` | `PATIENT`, `CAREGIVER`, `DOCTOR` | Retrieves an existing plan and child actions by ID, enforcing tenant boundaries. |
| `/api/agent/actions/:actionId` | `GET` | `PATIENT`, `CAREGIVER`, `DOCTOR` | Retrieves an individual action by ID with execution metadata, enforcing tenant boundaries. |

---

## 3. Governance, Authorization & Security Architecture

### 3.1 Session-Derived Identity & Anti-Spoofing
The helper `resolveActorRoleAndPatient(req)` guarantees that:
- `actorId` and `actorRole` come directly from `req.user.id` and `req.user.role`.
- When a `PATIENT` makes a request, `targetPatientId` is locked to their own ID. Any caller-supplied `targetPatientId` attempting cross-patient access is rejected.
- When a `CAREGIVER` makes a request for a patient, active caregiver consent in `CaregiverConsent` is queried. If consent is missing, revoked, or expired, access is blocked with 403 `CAREGIVER_CONSENT_REQUIRED`.
- When a `DOCTOR` reviews proposals or views patient plans, active assignment in `DoctorPatientAssignment` is required. Unassigned clinicians receive 403 `UNASSIGNED_CLINICIAN` or 403 `UNAUTHORIZED_ACTOR_ROLE`.
- The `ADMIN` role is blocked from executing or confirming clinical agent actions.

### 3.2 Emergency Precedence at API Level
- During plan generation (`POST /api/agent/plan`), if red-flag symptoms ('chest pain', 'unconscious', 'cannot breathe', etc.) or acute hypoglycemia (< 54 mg/dL) are detected:
  - The runtime halts immediately, returning HTTP 200 with `emergencyPrecedence: true`, `emergencyNotice`, and `actions: []`.
  - A structured warning is logged via `clinicalAuditLogger`.
- During confirmation (`POST /api/agent/execute/:actionId`), if spoken or text confirmation contains critical symptoms:
  - The action and plan transition to `EMERGENCY_ABORTED`.
  - The API responds with HTTP 400 `EMERGENCY_HALT` and immediate medical hotline guidance (112/108).

### 3.3 Prohibited Clinical Intent Refusal
If a user query attempts prohibited clinical activities (prescribing, insulin adjustments, dose modifications, independent diagnosis, clinical target changes, log deletion, consent bypass):
- The runtime refuses deterministically with HTTP 200 `refusalCategory` and clinical safety explanation.
- No database records (`AgentPlan` or `AgentAction`) are created.

### 3.4 Concurrency & Idempotency Gateway
- Re-submitting an already completed action with the same idempotency key returns HTTP 200 with `replayed: true` and cached `executionResult` without duplicating mutations.
- Concurrent requests racing to confirm the same action are resolved via atomic database conditional claims (`updateMany ... status = 'AWAITING_CONFIRMATION'`). Exactly one caller wins; the losing request receives a concurrency conflict error or cached replay.

---

## 4. Known Deployment Blockers & Operational Notices

> [!WARNING]
> **Deployment Blocker: Background Stale Expiration Scheduler**
> As identified during P0.7.2 and P0.7.3, the system implements lazy expiration on read and confirmation (`expireStalePlansAndActions()`), but an automated background cron/daemon scheduler has not been deployed to periodically sweep expired records without incoming requests. Adding persistent background daemon schedulers remains deferred until infrastructure authorization.

---

## 5. Verification & Test Evidence

### 5.1 Test Execution Summary

| Suite / Command | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| `p0_7_4_agent_api.test.ts` | P0.7.4 Integration Endpoints | **PASS** | **36 / 36 tests passed** (7.25s) |
| `p0_7_3_agent_runtime.test.ts` | P0.7.3 Governed Runtime | **PASS** | **53 / 53 tests passed** (5.81s) |
| `p0_7_1_agentic_contracts.test.ts` | P0.7.1 Agent Contracts | **PASS** | **70 / 70 tests passed** (0.69s) |
| Full API Regression Suite | Entire API workspace | **PASS** | **24 test suites, 452 / 452 tests passed** (71.46s) |
| `npm run test:mobile` | Mobile app test suite | **PASS** | **12 / 12 tests passed** (0.15s) |
| `npm run test:web` | Doctor web workstation suite | **PASS** | **13 / 13 tests passed** (0.62s) |
| `npm run build` | API & Web TypeScript build | **PASS** | Clean build, zero TypeScript errors (`tsc` code 0) |

### 5.2 P0.7.4 Test Groups Verified in `p0_7_4_agent_api.test.ts`
1. **Authentication & Feature Flag Governance:**
   - 401 Unauthorized when Authorization header is missing.
   - 401 Unauthorized on corrupted or expired token.
   - 403 FEATURE_DISABLED when `P0_7_AGENTIC_EXECUTION = false`.
2. **POST /api/agent/plan:**
   - Bounded plan generation (max 3 actions) for authenticated patient.
   - 400 Bad Request when `consentObtained` is missing or false.
   - 400 Bad Request when query is too short.
   - Immediate emergency halt on acute symptoms ('chest pain') without action generation.
   - Immediate emergency halt on severe hypoglycemia (< 54 mg/dL).
   - Deterministic refusal of prohibited intents (e.g. prescribing).
   - Rejection of cross-patient planning attempt by unauthorized patient.
   - Authorization of caregiver with active consent.
   - Rejection of caregiver lacking patient consent.
3. **POST /api/agent/execute/:actionId:**
   - Successful confirmation and execution of scheduled reminder for authenticated patient.
   - Idempotent replay caching (`replayed: true`) on duplicate execution.
   - Cross-patient execution rejection when Patient B targets Patient A action.
   - 400 Bad Request on actionId mismatch between URL path and JSON body.
   - Rejection on stale `planVersion`.
   - Emergency halt during confirmation if patient speaks critical symptoms.
   - Concurrency race condition resolution yielding exactly one completed execution.
4. **POST /api/agent/cancel/:actionId:**
   - Patient cancellation of eligible pending action.
   - Cross-patient cancellation rejection.
   - 404 Not Found on invalid action ID.
5. **Clinical Proposals & Clinician Review (Doctor Workstation):**
   - 403 CLINICIAN_ONLY for non-clinician calling `GET /api/agent/proposals`.
   - Assigned clinician viewing proposals for Patient A.
   - Unassigned clinician strictly blocked from viewing Patient A proposals.
   - Assigned clinician approving proposal with clinical review notes.
   - Assigned clinician rejecting proposal with rejection reason.
   - Unassigned clinician rejected from reviewing Patient A proposal.
   - Rejection when reviewing an action not in `PENDING_CLINICIAN_APPROVAL`.
6. **Plan & Action Retrieval:**
   - Patient A retrieving their own plan and action.
   - Patient B blocked from retrieving Patient A plan or action (403 UNAUTHORIZED_ACTOR_ROLE).
   - 404 Not Found for nonexistent IDs.
7. **Strict Validation & Malformed Input:**
   - 400 Bad Request on malformed non-UUID actionId.
   - 400 Bad Request on malformed non-UUID planId.

---

## 6. Scope Boundaries & Clinical Safety Preservation

- **No UI implementation:** P0.7.5 (Mobile UI) and P0.7.6 (Doctor Dashboard UI) remain strictly untouched.
- **No external integrations:** P0.8 remain untouched and disabled (`P0_8_EXTERNAL_INTEGRATIONS = false`).
- **No database schema changes:** No new Prisma models or migrations were introduced.
- **Feature flag default:** `P0_7_AGENTIC_EXECUTION = false` remains disabled by default.
- **Clinical safety status:** `PENDING_CLINICIAN_APPROVAL`.

---

## 7. Modified Files Manifest

- [`packages/contracts/src/index.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/packages/contracts/src/index.ts): Added request validation schemas (`AgentProposalReviewRequestSchema`, updated `AgentPlanRequestSchema`, `AgentActionConfirmRequestSchema`, `AgentActionCancelRequestSchema`).
- [`services/api/src/routes/agent.routes.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/routes/agent.routes.ts): New Express router implementing all 7 endpoints with governance, authentication, and validation.
- [`services/api/src/server.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/server.ts): Mounted `/api/agent` with `agentRouter`.
- [`services/api/src/__tests__/p0_7_4_agent_api.test.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/__tests__/p0_7_4_agent_api.test.ts): 36 end-to-end integration tests.
- [`docs/phases/P0_7_4_completion_report.md`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/docs/phases/P0_7_4_completion_report.md): This completion report.

---

## 8. Conclusion & Sign-Off Recommendation

Phase P0.7.4 is fully implemented, verified, and ready for strict read-only independent security audit. All automated regression suites pass across all packages, and all clinical safety constraints remain intact.

