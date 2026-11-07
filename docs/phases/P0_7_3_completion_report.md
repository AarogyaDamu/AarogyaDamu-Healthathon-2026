# Phase P0.7.3 Completion Report: Agent Runtime & Proposal Engine

**Project:** AarogyaDamu Project 3 — Diabetes Care Journey Companion  
**Phase:** P0.7 — Governed Agentic Execution  
**Sub-Phase:** P0.7.3 — Agent Runtime & Proposal Engine  
**Execution Timestamp:** 2026-11-03T12:28:00+05:30  
**Git Branch:** `cleanup-checkpoint`  
**Decision / Status:** `P0.7.3_COMPLETED — READY_FOR_INDEPENDENT_AUDIT`  
**Clinical Approval Status:** `PENDING_CLINICIAN_APPROVAL`  
**Feature Flag Status:**  
- `P0_7_AGENTIC_EXECUTION = false` (Disabled by default in production and development)  
- `P0_8_EXTERNAL_INTEGRATIONS = false` (Disabled)  

---

## 1. Executive Summary

Phase **P0.7.3 (Agent Runtime & Proposal Engine)** has been implemented and verified. The runtime transforms patient and caregiver requests into bounded, validated, governed agent action plans strictly adhering to clinical safety non-negotiables, explicit tool allowlists, patient ownership boundaries, active clinician doctor-patient assignments, and atomic concurrency controls.

### Core Guarantees Enforced:
1. **Strict 6-Tool Allowlist:** Only the 6 approved tools (`tool_schedule_care_task`, `tool_schedule_reminder`, `tool_request_appointment`, `tool_log_lifestyle_record`, `tool_draft_care_proposal`, `tool_query_health_summary`) can be registered or dispatched. Any unknown or unapproved tool is rejected immediately.
2. **Bounded Plan Scope (Maximum 3 Actions):** Plans are bounded by `MAX_ACTIONS_PER_PLAN = 3` validated both statically via `validatePlanActionCount` and at runtime before persistence.
3. **Atomic Nested Persistence:** Plans and child actions are persisted in a single atomic nested write (`prisma.agentPlan.create({ data: { ..., actions: { create: [...] } } })`). Incremental un-audited action addition is prohibited.
4. **Emergency Precedence Halt:** Red-flag symptoms ('chest pain', 'unconscious', 'cannot breathe', 'seizure', 'choking') or acute hypoglycemia (< 54 mg/dL) halt planning and confirmation immediately. Confirmation-time emergencies transition parent plans to `EMERGENCY_ABORTED`.
5. **Deterministic Prohibited Intent Refusal:** All 7 prohibited categories (prescribing, insulin adjustment, dose changes, independent diagnosis, target range override, log deletion, consent bypass) are rejected with deterministic refusal contracts without creating or executing actions.
6. **Multi-Role Authorization & Tenant Isolation:** Direct patient self-access is strictly bounded; cross-patient impersonation is blocked; clinician access requires active `DoctorPatientAssignment`; caregiver access requires active consent and specific granular permissions; admin role is blocked from clinical agent execution.
7. **Atomic Concurrency Claim:** Action confirmation uses conditional `updateMany({ where: { id, planId, status: 'AWAITING_CONFIRMATION' }, data: { status: 'EXECUTING' } })`. Competing claims yield exactly one winner, preventing double execution.
8. **Idempotent Replay:** Re-submitting an already completed action returns the cached `executionResult` without duplicating mutations.

### Canonical Tool Allowlist & Risk Tiers (Contract Single Source of Truth)

| Tool Name | Canonical Risk Tier | Required Caregiver Scope | Confirmation / Approval Gateway |
| :--- | :--- | :--- | :--- |
| `tool_query_health_summary` | `LOW_RISK` | `VIEW_OBSERVATIONS` | Read-only; auto-executable |
| `tool_schedule_care_task` | `MEDIUM_RISK` | `MANAGE_TASKS` | Patient confirmation required |
| `tool_schedule_reminder` | `MEDIUM_RISK` | `MANAGE_REMINDERS` | Patient confirmation required |
| `tool_request_appointment` | `MEDIUM_RISK` | `MANAGE_CONSULTATIONS` | Patient confirmation required |
| `tool_log_lifestyle_record` | `MEDIUM_RISK` | `MANAGE_LIFESTYLE` | Patient confirmation required |
| `tool_draft_care_proposal` | `HIGH_RISK` | `VIEW_CARE_PLAN` | Assigned clinician approval required |

---

## 2. Component Architecture & Modules Implemented

The runtime is organized into modular services located in [`services/api/src/ai/agent/`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/):

| Module | File | Role & Governance Enforcement |
| :--- | :--- | :--- |
| **Tool Registry** | [`toolRegistry.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/toolRegistry.ts) | Registers all 6 allowlisted tools with deterministic risk tiers, required caregiver permissions, and Zod parameter validation schemas. Rejects speculative tools. |
| **Concrete Tool Executor** | [`toolExecutor.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/toolExecutor.ts) | Concrete execution logic mapping tools to Prisma entities (`CareTask`, `Reminder`, `Appointment`, `LifestyleRecord`, `AgentAuditRecord`, `HealthObservation`). Enforces idempotency keys. |
| **Intent Classifier** | [`intentClassifier.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/intentClassifier.ts) | Evaluates emergency precedence, checks prohibited clinical intent, and formulates candidate tool proposals bounded to allowlisted capabilities. |
| **Authorization Service** | [`agentAuthorizationService.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentAuthorizationService.ts) | Enforces patient ownership, checks active `DoctorPatientAssignment` for clinicians (SEC-P0.7-03), evaluates granular caregiver permissions (SEC-P0.7-04), and blocks administrative bypass. |
| **Agent Planner** | [`agentPlanner.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentPlanner.ts) | Orchestrates proposal generation, enforces 3-action maximum, computes highest risk tier, validates all parameters, and performs atomic nested plan persistence. |
| **Execution Coordinator** | [`agentExecutionCoordinator.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentExecutionCoordinator.ts) | Dispatches claimed actions, manages action terminal state transitions (`COMPLETED` / `FAILED`), aggregates parent plan state (`COMPLETED` / `PARTIALLY_EXECUTED`), and writes audit logs. |
| **Confirmation Service** | [`agentConfirmationService.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentConfirmationService.ts) | Re-evaluates emergency precedence at confirmation, checks plan binding, enforces action executability, performs atomic conditional claims, and handles clinician reviews. |
| **Agent Runtime Engine** | [`agentRuntime.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentRuntime.ts) | Facade class exposing `generatePlan()`, `confirmAction()`, `reviewProposal()`, `cancelAction()`, `getPlan()`, `getAction()`, and `expireStalePlansAndActions()`. |
| **Barrel Export** | [`index.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/index.ts) | Clean public exports for internal API consumers. |

---

## 3. Verification & Test Evidence

### 3.1 P0.7.3 Specific Test Suite
- **File:** [`services/api/src/__tests__/p0_7_3_agent_runtime.test.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/__tests__/p0_7_3_agent_runtime.test.ts)
- **Result:** `PASS`
- **Total Tests:** 53 passed, 0 failed
- **Execution Time:** 17.596 s

#### Detailed Test Group Breakdown:
1. **Tool Registry & Strict Parameter Validation:**
   - `registers exactly the 6 approved allowlisted tools`: PASS
   - `rejects unapproved or speculative tools immediately`: PASS
   - `validates parameters strictly and rejects missing or malformed inputs`: PASS
   - `defensively validates parameters in executeAgentTool rejecting malformed or tampered parameters (SEC-P0.7.3-01)`: PASS
   - `derives risk tier deterministically from contracts and prevents caller risk-tier manipulation`: PASS
2. **Intent Classification & Allowlisted Tool Proposal Mapping:**
   - `classifies reminder queries into tool_schedule_reminder proposals`: PASS
   - `classifies glucose monitoring queries into tool_schedule_care_task proposals`: PASS
   - `classifies consultation requests into tool_request_appointment proposals`: PASS
   - `classifies physical activity queries into tool_log_lifestyle_record proposals`: PASS
   - `classifies clinical tolerance or side-effect queries into tool_draft_care_proposal proposals`: PASS
   - `classifies trend and metrics queries into tool_query_health_summary proposals`: PASS
3. **Bounded Action Plans (Max 3 Actions Boundary):**
   - `validates that 1, 2, or 3 actions are accepted`: PASS
   - `rejects candidate action lists exceeding 3 actions`: PASS
   - `rejects plan generation when more than 3 candidate actions are submitted`: PASS
4. **Emergency Precedence Halt:**
   - `halts planning immediately on acute red-flag symptoms in query`: PASS
   - `halts planning immediately on severe hypoglycemia (< 54 mg/dL)`: PASS
   - `halts confirmation immediately when an emergency is detected at confirmation time and marks plan EMERGENCY_ABORTED`: PASS
5. **Prohibited Clinical Intent Refusal:**
   - `refuses PRESCRIBE_MEDICATION with deterministic safety explanation`: PASS
   - `refuses ADJUST_INSULIN_DOSE with deterministic safety explanation`: PASS
   - `refuses MODIFY_MEDICATION_DOSE with deterministic safety explanation`: PASS
   - `refuses INDEPENDENT_DIAGNOSIS with deterministic safety explanation`: PASS
   - `refuses CHANGE_CLINICAL_TARGET_WITHOUT_DOCTOR with deterministic safety explanation`: PASS
   - `refuses DELETE_OBSERVATION_HISTORY with deterministic safety explanation`: PASS
   - `refuses BYPASS_CAREGIVER_CONSENT with deterministic safety explanation`: PASS
6. **Authorization, Tenant & Cross-Patient Isolation:**
   - `allows patient self-access to generate and confirm plans`: PASS
   - `rejects cross-patient access when Patient B attempts to plan for Patient A`: PASS
   - `allows assigned clinician to create proposals and manage actions for Patient A`: PASS
   - `rejects unassigned clinician who lacks active DoctorPatientAssignment`: PASS
   - `allows authorized caregiver with MANAGE_TASKS permission to schedule care tasks`: PASS
   - `rejects cross-patient confirmation attempts (Patient B cannot confirm Patient A's action)`: PASS
   - `rejects caregiver attempting actions without required permission`: PASS
   - `rejects admin user from creating clinical agent plans`: PASS
7. **Confirmation Binding & Action Executability:**
   - `rejects confirmation with mismatched actionId`: PASS
   - `rejects confirmation with stale plan version`: PASS
   - `rejects execution of an action that was manually set to CANCELLED`: PASS
   - `rejects direct execution of action in AWAITING_CONFIRMATION without prior confirmation claim`: PASS
   - `rejects direct execution of action in DRAFT state`: PASS
8. **Atomic Concurrency Protection & Idempotent Replay:**
   - `executes action and subsequent replay returns cached result with replayed: true`: PASS
   - `safely handles concurrent execution claims where only one claim wins`: PASS
   - `correctly transitions plan to PARTIALLY_EXECUTED on partial failure of multi-action plan without repeating successful mutations`: PASS
9. **Complete Execution of All 6 Approved Tools & Audit Trail:**
   - `executes tool_schedule_care_task against Prisma CareTask model`: PASS
   - `executes tool_schedule_reminder against Prisma Reminder model`: PASS
   - `executes tool_request_appointment against Prisma Appointment model`: PASS
   - `executes tool_log_lifestyle_record against Prisma LifestyleRecord model`: PASS
   - `executes tool_draft_care_proposal creating an AgentAuditRecord held for clinician review`: PASS
   - `executes tool_query_health_summary read-only and calculates average metrics`: PASS
10. **Clinician Proposal Review (Approve & Reject Lifecycle):**
    - `allows assigned doctor to review and APPROVE a pending clinical proposal`: PASS
    - `allows assigned doctor to review and REJECT a pending clinical proposal`: PASS
    - `rejects review by an unassigned doctor`: PASS
11. **Action Cancellation & Temporal Expiration:**
    - `cancels an action and updates parent plan to CANCELLED when all actions cancelled`: PASS
    - `expires stale plans and actions that exceeded their 24-hour expiration window`: PASS
    - `reconciles abandoned EXECUTING actions when underlying mutation completed prior to crash (SEC-P0.7.3-02)`: PASS
    - `fails closed abandoned EXECUTING actions when no underlying mutation exists (SEC-P0.7.3-02)`: PASS

### 3.2 Full Monorepo Regression Verification

| Test Suite | Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| **API Test Suite** | Full backend test runner | **PASS** | 23 suites passed, 416 tests passed, 0 failed (75.423 s) |
| **Mobile Test Suite** | Expo / React Native flow | **PASS** | 12 tests passed, 0 failed (154 ms) |
| **Web Test Suite** | React / Vite Doctor Dashboard | **PASS** | 13 tests passed, 0 failed (673 ms) |
| **Monorepo Build** | Full TypeScript & Vite build | **PASS** | All workspaces compiled cleanly (exit code 0) |

---

## 4. Phase Boundary Compliance & Scope Guard

- **P0.7.3 Exclusivity:** Only the Agent Runtime and Proposal Engine components were implemented.
- **Excluded Sub-phases:**
  - P0.7.4 (Agent API Endpoints & Routes) remains UNTOUCHED.
  - P0.7.5 (Mobile Agent Confirmation UI) remains UNTOUCHED.
  - P0.7.6 (Web Clinician Proposal Dashboard) remains UNTOUCHED.
  - P0.8 (External Integrations / WhatsApp / Wearables) remains UNTOUCHED.
- **Database Schema:** No schema modifications or new migrations were added during P0.7.3.
- **Safety Flags:** `P0_7_AGENTIC_EXECUTION = false` and `P0_8_EXTERNAL_INTEGRATIONS = false`.
- **Clinical Review:** Preserved as `PENDING_CLINICIAN_APPROVAL`.

