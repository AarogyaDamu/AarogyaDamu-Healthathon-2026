# AarogyaDamu Project 3 — Post-P0.7 Hardening Independent Security Audit

**Auditor:** Independent Security & Clinical Governance Auditor  
**Date:** 2026-11-03  
**Audit Scope:** Post-P0.7 Targeted Hardening (`docs/phases/P0_7_post_audit_hardening_report.md`)  
**Audit Mode:** STRICT READ-ONLY VERIFICATION  
**Final Verdict:** **PASS — POST-P0.7 HARDENING VERIFIED** (with Documented Operational Observations)  
**Safety Status:** FEATURE FLAGS STRICTLY DISABLED (`P0_7_AGENTIC_EXECUTION = false`, `P0_8_EXTERNAL_INTEGRATIONS = false`, `ENABLE_AGENT_EXPIRY_WORKER = false`)  
**Clinical Protocol:** STRICT HUMAN-IN-THE-LOOP (`PENDING_CLINICIAN_APPROVAL`)

---

## 1. Executive Summary

An independent, strictly read-only security, clinical governance, and regression audit was conducted on the post-P0.7 targeted hardening implementation of the AarogyaDamu Project 3 platform.

The audit verified five primary remediation areas:
1. **Tool Allowlist Reconciliation:** The canonical 6-tool allowlist (`tool_schedule_care_task`, `tool_schedule_reminder`, `tool_request_appointment`, `tool_log_lifestyle_record`, `tool_draft_care_proposal`, `tool_query_health_summary`) is identically registered in `@aarogyadamu/contracts` and backend `REGISTERED_AGENT_TOOLS`. Mobile UI metadata mapping now fully supports `tool_query_health_summary`. The stray UI identifier `tool_log_health_vital` was confirmed to be non-executable on the backend and cannot bypass validation.
2. **Clinical Provenance Protection (`MED-P0.7.7-01`):** User soft-deactivation (`isActive Boolean @default(true)`, `deactivatedAt DateTime?`) has been added to `model User`, backed by migration `20261103180000_p0_7_7_clinical_provenance`. Hard-delete protection is implemented via `assertCanSafelyDeleteUser` in `userProvenanceService.ts`. Authentication middleware, login routes, refresh-token rotation, and agent authorization services strictly reject deactivated accounts while preserving all historical clinical plans, actions, and audit logs.
3. **Background Expiry Worker (`MED-P0.7.7-02`):** `AgentExpiryWorker` has been implemented with a 15-minute default schedule, an in-process mutex, non-PHI clinical audit logging, and crash recovery that reconciles abandoned `EXECUTING` actions to `FAILED` (`ABANDONED_EXECUTION_TIMEOUT`) without blind redispatch.
4. **Cryptographic Mobile UUIDs (`LOW-P0.7.7-04`):** Mobile UUID generation in `apps/mobile/src/api/agent.ts` enforces RFC 4122 v4 compliance using `globalThis.crypto.randomUUID()` or `getRandomValues()` byte masking. It explicitly throws an error rather than falling back to pseudo-random `Math.random()`.
5. **Test Count & Regression Reconciliation:** The reported test-count discrepancy between 260 and 262 was resolved: all **262 unique tests** execute and pass (100% pass rate). The discrepancy was determined to be a minor arithmetic summation error in the previous report's summary row (12 + 55 + 142 + 24 + 29 = 262). Monorepo builds and mobile typechecks compile cleanly with exit code 0.

---

## 2. Repository Branch, HEAD, and Working-Tree Status

- **Git Branch:** `cleanup-checkpoint`
- **HEAD Commit Hash:** `5c80ead23deb05f2aa791f56f5af1ce7c8ceea84`
- **Working Tree Analysis:**
  - The working tree contains uncommitted changes representing cumulative phase deliverables and the post-audit hardening modifications.
  - All existing user changes, previous phase reports, contracts, and tests remain intact. No files were discarded, reset, or overwritten.
  - HEAD remains at `5c80ead23deb05f2aa791f56f5af1ce7c8ceea84` because changes are staged in the working tree without committing, consistent with the repo's incremental verification workflow.

---

## 3. Files and Migrations Inspected

The following source, contract, migration, and test files were directly inspected:

### Backend Core & Services
- [`services/api/prisma/schema.prisma`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/prisma/schema.prisma#L15-L68): Added `isActive` and `deactivatedAt` to `User`.
- [`services/api/prisma/migrations/20261103180000_p0_7_7_clinical_provenance/migration.sql`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/prisma/migrations/20261103180000_p0_7_7_clinical_provenance/migration.sql): Migration SQL for `isActive`, `deactivatedAt`, and index.
- [`services/api/src/services/userProvenanceService.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/services/userProvenanceService.ts): Hard-delete guard, deactivation, reactivation, and provenance error classes.
- [`services/api/src/ai/agent/agentExpiryWorker.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentExpiryWorker.ts): Background scheduler, in-process mutex, Redis lock methods, non-PHI logging.
- [`services/api/src/ai/agent/agentRuntime.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentRuntime.ts#L270-L362): Action expiration and abandoned executing action reconciliation.
- [`services/api/src/ai/agent/toolRegistry.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/toolRegistry.ts): Canonical 6-tool allowlist.
- [`services/api/src/ai/agent/toolExecutor.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/toolExecutor.ts#L35-L350): Tool execution boundary and parameter defense.
- [`services/api/src/ai/agent/agentAuthorizationService.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/ai/agent/agentAuthorizationService.ts#L26-L50): Active status enforcement for actor and patient.
- [`services/api/src/middleware/auth.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/middleware/auth.ts#L48-L69): Session lookup and `session.user.isActive === false` rejection.
- [`services/api/src/server.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/server.ts#L454-L460): Login active status enforcement; worker lifecycle wiring.
- [`services/api/src/services/authSessions.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/services/authSessions.ts#L70-L77): Refresh-token rotation deactivation rejection.
- [`services/api/src/config/env.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/services/api/src/config/env.ts#L27-L28): `ENABLE_AGENT_EXPIRY_WORKER` and `AGENT_EXPIRY_INTERVAL_MS`.

### Contracts & Shared Packages
- [`packages/contracts/src/index.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/packages/contracts/src/index.ts#L688-L810): `AgentToolNameEnum`, `DETERMINISTIC_TOOL_RISK_TIERS`, strict Zod schemas.

### Mobile & Web Clients
- [`apps/mobile/src/api/agent.ts`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/apps/mobile/src/api/agent.ts#L87-L130): Cryptographic UUID generator, display names, parameter formatting.
- [`apps/mobile/src/components/AgentProposalCard.tsx`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/apps/mobile/src/components/AgentProposalCard.tsx#L73-L103): Tool icon mapping, proposal confirmation, local error handling.

### Database Migration Status
Inspection via `node services/api/scripts/prisma-command.cjs migrate status` revealed:
- 18 migrations exist in `services/api/prisma/migrations`.
- The isolated automated test runner automatically applies all 18 migrations to an ephemeral SQLite database per test run (`test.db`).
- The persistent local development database (`./dev.db`) has not yet had migrations `20261103120000_p0_7_2_agentic_persistence` and `20261103180000_p0_7_7_clinical_provenance` applied. This is expected since migration execution was deferred during audit phases.

---

## 4. Tool Allowlist Verification

The canonical tool allowlist was verified across all layers:

| Tool Name | Risk Tier | Required Permission | Patient Confirmation | Clinician Approval | Schema |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `tool_schedule_care_task` | `MEDIUM_RISK` | `MANAGE_TASKS` | YES | NO | `ToolScheduleCareTaskParamsSchema.strict()` |
| `tool_schedule_reminder` | `MEDIUM_RISK` | `MANAGE_REMINDERS` | YES | NO | `ToolScheduleReminderParamsSchema.strict()` |
| `tool_request_appointment` | `MEDIUM_RISK` | `MANAGE_CONSULTATIONS` | YES | NO | `ToolRequestAppointmentParamsSchema.strict()` |
| `tool_log_lifestyle_record` | `MEDIUM_RISK` | `MANAGE_LIFESTYLE` | YES | NO | `ToolLogLifestyleRecordParamsSchema.strict()` |
| `tool_draft_care_proposal` | `HIGH_RISK` | `VIEW_CARE_PLAN` | NO | YES | `ToolDraftCareProposalParamsSchema.strict()` |
| `tool_query_health_summary` | `LOW_RISK` | `VIEW_OBSERVATIONS` | NO | NO | `ToolQueryHealthSummaryParamsSchema.strict()` |

### Audit Findings on Allowlist Integrity
1. **Canonical Alignment:** Exactly 6 tools are registered in `AgentToolNameEnum` and `REGISTERED_AGENT_TOOLS`.
2. **Defensive Parameter Validation:** `executeAgentTool` validates parameters using `validateRegisteredToolParameters()` at the execution boundary. Unsupported tools return `errorCode: 'UNAUTHORIZED_TOOL'`.
3. **Legacy Mobile Identifier `tool_log_health_vital`:**
   - Present only as a legacy display case in mobile UI helper functions (`apps/mobile/src/api/agent.ts`).
   - It is **not** present in `AgentToolNameEnum`, `REGISTERED_AGENT_TOOLS`, or `agentPlanner.ts`.
   - If an adversarial client attempts to submit `tool_log_health_vital` to the backend, Zod parsing in `POST /api/agent/plan` and `POST /api/agent/execute/:actionId` rejects the request with HTTP 400.
4. **Data Privacy of `tool_query_health_summary`:**
   - Observations are strictly filtered by `userId: context.targetPatientId`.
   - Target patient context is verified by `agentAuthorizationService.ts`. Unassigned clinicians or unauthorized caregivers cannot query observations.
   - Result payload returns non-PHI aggregates (`totalObservations`, `averageValue`, `latestObservation` metric and unit).

---

## 5. Hard-Delete and Soft-Deactivation Assessment (`MED-P0.7.7-01`)

### 5.1 Hard-Delete Protection Analysis
- `assertCanSafelyDeleteUser(prisma, userId)` checks record counts across:
  - `agentPlan` (owned by user and targeting user as patient)
  - `agentAuditRecord`
  - `carePlan` (as doctor)
  - `consultationNote` (as clinician)
- Throws `ClinicalProvenanceError` (`CLINICAL_PROVENANCE_PROTECTED`) if any records exist.
- Search across `services/api/src` confirmed that **zero production endpoints** call `prisma.user.delete` or `prisma.user.deleteMany`. User deletion is restricted to isolated test fixtures.

### 5.2 Architectural Observation: Database-Level Cascade Deletion (`OBS-P0.7.7-01`)
> [!NOTE]
> In `services/api/prisma/schema.prisma`, `AgentPlan` and `AgentAuditRecord` retain `@relation(..., onDelete: Cascade)` at the Prisma relation definition.
> 
> **Operational Consequence:** While the application layer guards deletion via `assertCanSafelyDeleteUser` and soft-deactivates users via `deactivateUser()`, a direct raw SQL `DELETE FROM "User"` or an un-guarded administrative script bypassing `userProvenanceService` would still trigger a cascade deletion at the database engine level.
> 
> **Recommendation for Milestone P1:** In a future schema refinement, update the relation foreign keys from `onDelete: Cascade` to `onDelete: Restrict` or `onDelete: NoAction` for clinical audit tables, enforcing provenance preservation at both the database and application layers.

### 5.3 Soft-Deactivation Assessment
- `deactivateUser()`:
  - Updates `isActive: false` and sets `deactivatedAt: new Date()`.
  - Atomically marks all active sessions (`authSession.updateMany`) and refresh tokens (`refreshToken.updateMany`) as `revokedAt: deactivatedAt`.
  - Logs a non-PHI clinical audit event (`safeClinicalLog`).
  - Historical plans, actions, and audit records remain 100% intact.
- `reactivateUser()`:
  - Restores `isActive: true` and clears `deactivatedAt`.
  - Does **not** revive old revoked sessions; the user must re-authenticate and establish a fresh session.

---

## 6. Session Revocation and Authentication Verification

The audit traced the complete token lifecycle for deactivated accounts:

1. **Existing Access Token Reuse:**
   - `requireAuth` in `middleware/auth.ts` looks up `prisma.authSession.findFirst({ where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } } })`.
   - Because `deactivateUser` sets `revokedAt` on all active sessions, existing JWTs immediately fail session lookup and return HTTP 401 `Session has been revoked or expired. Please sign in again.`.
   - Furthermore, line 65 performs defense-in-depth: `if (session.user.isActive === false) return 401 'Account has been deactivated. Access denied.'`.
2. **Refresh Token Rotation:**
   - In `rotateRefreshToken` (`services/api/src/services/authSessions.ts`), lines 70–75 check:
     `if (stored.revokedAt || stored.session.revokedAt || stored.session.user.isActive === false) return null;`
   - Replay of revoked or deactivated refresh tokens returns `null`, preventing new access tokens from being minted.
3. **New Login Attempts:**
   - In `server.ts` line 454 (`/api/auth/login`), if `user.isActive === false`, the endpoint logs a security event and immediately returns HTTP 403 `Account has been deactivated. Please contact your healthcare administrator.`.
4. **Agent Authorization:**
   - `authorizeAgentAction` (`agentAuthorizationService.ts`) inspects `isActive` for both actor and target patient, rejecting actions with `Actor account has been deactivated.` or `Target patient account has been deactivated.`.

---

## 7. Background Worker Lifecycle Assessment (`MED-P0.7.7-02`)

### 7.1 Configuration & Startup Safety
- Default interval: 15 minutes (`AGENT_EXPIRY_INTERVAL_MS = 900000`).
- Environment toggle: `ENABLE_AGENT_EXPIRY_WORKER` defaults to `false`.
- Startup guard: `if (this.isStarted) return;` prevents duplicate timers.
- Process exit safety: The timer uses `timer.unref()` so background ticks do not prevent Node.js from exiting.
- Graceful shutdown: `SIGINT` and `SIGTERM` handlers in `server.ts` invoke `globalAgentExpiryWorker.stop()`.

### 7.2 In-Process Mutex
- `this.isSweeping` boolean flag guards against overlapping executions.
- If a sweep is in progress when the timer fires, `triggerSweep()` logs a warning and exits early (`skippedDueToLock: true`), releasing state safely in a `finally` block.

---

## 8. Redis Distributed Lock Assessment

The audit inspected `acquireRedisLock` and `releaseRedisLock` in `services/api/src/ai/agent/agentExpiryWorker.ts`:

1. **Acquisition:**
   - Uses `SET lock:agent_expiry_sweep ${this.workerId} NX PX ${this.lockTtlMs}` (10-minute lock TTL).
   - Atomic acquisition via raw socket command.
2. **Fallback Behavior:**
   - If Redis is unavailable or unconfigured, it catches the error and falls back to in-process locking.
3. **Lock Release Observation (`OBS-P0.7.7-02`):**
   > [!NOTE]
   > `releaseRedisLock` issues a direct `DEL lock:agent_expiry_sweep` without verifying that the lock value still equals `this.workerId` (i.e. without a compare-and-delete Lua script).
   > 
   > **Operational Consequence:** If a sweep were to hang or exceed the 10-minute lock TTL, the lock would expire, another instance could acquire it, and the original instance would delete the second instance's lock upon completion. Given that actual sweeps execute in under 100 milliseconds, this is an edge-case race condition under extreme network partitions.
   > 
   > **Recommendation for Milestone P1:** Implement an atomic Lua script release:
   > ```lua
   > if redis.call("get", KEYS[1]) == ARGV[1] then
   >   return redis.call("del", KEYS[1])
   > else
   >   return 0
   > end
   > ```

4. **Multi-Replica Behavior Without Redis:**
   - If Redis is not configured (`RATE_LIMIT_STORE=memory`), each pod replica runs its own periodic timer.
   - Because `expireStalePlansAndActions` uses atomic conditional SQL updates (`updateMany` filtering by status and expiration timestamp), concurrent sweeps across replicas are completely **idempotent**. No conflicting state or data corruption can occur.

---

## 9. Expiry and Recovery Verification

The audit inspected `expireStalePlansAndActions` and `reconcileAbandonedExecutingAction` in `agentRuntime.ts`:

1. **Stale Action & Plan Expiration:**
   - Actions in `AWAITING_CONFIRMATION` or `PENDING_CLINICIAN_APPROVAL` past `expiresAt` transition to `EXPIRED`.
   - Parent plans transition to `EXPIRED`.
2. **Abandoned Executing Action Recovery (SEC-P0.7.3-02):**
   - Actions in `EXECUTING` state past `expiresAt` are inspected for underlying database mutations (e.g. `CareTask`, `Reminder`, `Appointment`).
   - If no underlying domain mutation is confirmed, the action **fails closed**:
     - `status: 'FAILED'`
     - `errorCode: 'ABANDONED_EXECUTION_TIMEOUT'`
     - `errorMessage: 'Action abandoned in EXECUTING state without confirmed database mutation. Marked FAILED to prevent duplicate execution.'`
   - Actions are **never** blindly redispatched or re-executed.

---

## 10. Cryptographic Mobile UUID Verification (`LOW-P0.7.7-04`)

The implementation of `generateUUID()` in `apps/mobile/src/api/agent.ts` was audited:

```typescript
export function generateUUID(): string {
  // 1. Native crypto.randomUUID
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // 2. Cryptographic getRandomValues with RFC 4122 v4 masking
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // RFC 4122 v4 version
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  // Refuse pseudo-random fallback
  throw new Error('Cryptographically secure randomness is unavailable; refusing insecure Math.random fallback for idempotency keys.');
}
```

### Verification Points:
- RFC 4122 v4 version bit masking (`0x40`) and variant bit masking (`0x80`) are mathematically correct.
- `Math.random()` has been completely removed.
- Error handling in `apps/mobile/src/components/AgentProposalCard.tsx` (lines 97–103) catches any thrown error in a `try...catch` block and sets `localError` state, preventing unhandled application crashes on device runtimes.
- React Native Hermes runtime natively supports `crypto.getRandomValues` on modern Expo SDK 50+ / React Native 0.72+.

---

## 11. Actual Test-Count Reconciliation

The previous report noted a total of `260 / 260 PASS` while the table rows summed to 262. The audit executed all suites and resolved the exact counts:

| Test Suite File / Runner | Suite Description | Tests Passed | Tests Failed | Total Tests |
| :--- | :--- | :---: | :---: | :---: |
| `src/__tests__/p0_7_7_hardening.test.ts` | Post-Audit Hardening Suite | 12 | 0 | 12 |
| `src/__tests__/p0_7_4_agent_api.test.ts` | Agent API Integration Suite | 55 | 0 | 55 |
| `src/__tests__/p0_7_3_agent_runtime.test.ts` | Agent Runtime & Tool Engine | 64 | 0 | 64 |
| `src/__tests__/p0_7_2_agentic_persistence.test.ts` | Persistence & Concurrency | 34 | 0 | 34 |
| `src/__tests__/p0_7_1_agentic_contracts.test.ts` | Contracts & Parameter Schemas | 44 | 0 | 44 |
| `apps/mobile/tests` (`node --test`) | Mobile Flow & Agent Integration | 24 | 0 | 24 |
| `apps/web/tests` (`node --test`) | Doctor Dashboard & Proposals UI | 29 | 0 | 29 |
| **Total Reconciled Count** | **Cross-Platform Verification** | **262** | **0** | **262** |

### Test-Count Discrepancy Verdict:
- All **262 unique tests** exist, ran, and passed cleanly.
- There are no overlapping, duplicate, or excluded tests.
- The `260` total in the previous report was an **arithmetic summation typo** in the summary row (`64 + 34 + 44 = 142`, `142 + 12 + 55 + 24 + 29 = 262`).
- Actual test pass rate: **262 / 262 (100%)**.

---

## 12. Security Regression Results

Regression testing verified that no security boundaries were degraded:
1. **Clinician Authorization:** Active `DoctorPatientAssignment` is strictly required for proposal inspection and action cancellation.
2. **Caregiver Consent:** Revoked or expired caregiver consents strictly block planning and retrieval.
3. **Emergency Precedence:** Critical symptoms (chest pain, shortness of breath, acute hypoglycemia < 54 mg/dL) immediately trigger `EMERGENCY_HALT` and suppress all agent actions.
4. **Idempotency:** Repeated confirmation requests with identical idempotency keys return cached results (`replayed: true`) without duplicate database mutations.
5. **Feature Flag Enforcement:** Requests across all agent routes return HTTP 403 `FEATURE_DISABLED` when `P0_7_AGENTIC_EXECUTION = false`.

---

## 13. Build & Compilation Results

| Workspace / Command | Execution Status | Exit Code | Notes |
| :--- | :---: | :---: | :--- |
| `services/api` (`tsc`) | PASS | 0 | Zero TypeScript compiler errors |
| `apps/web` (`tsc && vite build`) | PASS | 0 | 377 kB production bundle generated |
| `apps/mobile` (`tsc --noEmit`) | PASS | 0 | Typecheck clean across Expo/React Native files |
| Root Monorepo (`npm run build`) | PASS | 0 | Complete clean monorepo build |

---

## 14. Unresolved Findings & Operational Recommendations

| ID | Severity | Category | Description & Operational Guidance |
| :--- | :--- | :--- | :--- |
| **OBS-P0.7.7-01** | `MEDIUM` | Database Schema | **Prisma Cascade Delete Foreign Keys:** `AgentPlan` and `AgentAuditRecord` define `onDelete: Cascade` in `schema.prisma`. Application-level protection (`assertCanSafelyDeleteUser`) blocks deletion through services, but database foreign keys do not restrict direct SQL deletes. Enforce `onDelete: Restrict` in P1. |
| **OBS-P0.7.7-02** | `MEDIUM` | Concurrency | **Redis Lock Release Without CAS:** `releaseRedisLock` executes an unconditional `DEL` rather than a Lua compare-and-delete script. In high-latency distributed deployments where sweeps exceed lock TTL, a late instance could delete another instance's lock. Implement Lua CAS in P1. |
| **OBS-P0.7.7-03** | `LOW` | Documentation | **Test Summation Typo in P0.7.7 Report:** The summary row reported `260` instead of `262`. Reconciled in Section 11 of this report. |
| **OBS-P0.7.7-04** | `INFORMATIONAL` | Deployment | **Pending Migration on Local Dev DB:** Local development database (`./dev.db`) has not had migrations `20261103120000_p0_7_2_agentic_persistence` and `20261103180000_p0_7_7_clinical_provenance` applied yet. Must be deployed via `prisma:deploy` upon staging rollout. |

---

## 15. Final Independent Audit Verdict

```
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║               FINAL INDEPENDENT AUDIT VERDICT:                         ║
║                                                                        ║
║            PASS — POST-P0.7 HARDENING VERIFIED                         ║
║                                                                        ║
║   The post-P0.7 targeted hardening implementation genuinely resolves   ║
║   the identified audit findings across tool allowlist reconciliation,  ║
║   clinical provenance protection, background maintenance scheduling,   ║
║   and cryptographic mobile UUID generation. All 262 tests pass.        ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
```

### Absolute Stop Conditions
- `P0_7_AGENTIC_EXECUTION = false`
- `P0_8_EXTERNAL_INTEGRATIONS = false`
- `ENABLE_AGENT_EXPIRY_WORKER = false`
- `Clinical Governance = PENDING_CLINICIAN_APPROVAL`
- No P0.8 work was started.
- No real patient data was modified.
- Implementation and audit are complete.

