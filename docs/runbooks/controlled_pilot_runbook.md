# AarogyaDamu Project 3 — Controlled Pilot Runbook & Operational Procedures

## Phase 5 Deliverable: Pilot Readiness & Real-World Validation

---

## 1. Regulatory Status & Non-Clinical Disclaimer

> [!IMPORTANT]
> **Mandatory Regulatory Statement**
> 
> “AarogyaDamu is an investigational diabetes care and decision-support companion. It is not a substitute for professional medical judgment, diagnosis, or treatment. The project does not claim CDSCO or FDA medical-device certification or clearance. Clinical decisions remain the responsibility of qualified healthcare professionals.”
>
> *This disclaimer alone does not establish legal or regulatory compliance. All real-world pilot demonstrations must be strictly restricted to pre-approved synthetic patient data in closed, non-clinical evaluation environments.*

---

## 2. SQLite Database Backup & Recovery Runbook

AarogyaDamu uses SQLite in Write-Ahead Logging (WAL) mode for development and local pilot testing (`services/api/prisma/dev.db`). In WAL mode, recent changes may reside in `dev.db-wal` rather than the main database file. Plain filesystem copies (`copy dev.db`) during active writes can result in corrupted or partial snapshots. The procedures below guarantee atomic, consistent, and verifiable backups.

### 2.1 When to Back Up

1. **Before Seeding / Resetting**: Always create a checkpointed backup before running `npm run db:seed` or applying new migrations.
2. **Prior to Pilot Sessions**: Create a timestamped baseline backup immediately before initiating any synthetic pilot walkthrough.
3. **Post-Evaluation Milestone**: Create a snapshot following consultation recording, care-plan approval, or delegated task cycles to preserve trial history for review.
4. **Before Upgrades or Maintenance**: Back up prior to schema updates, dependencies updates, or node runtime changes.

### 2.2 Backup Procedures

#### Method A: SQLite Interactive Shell (Recommended)
Use the native SQLite CLI `.backup` command, which automatically locks, checkpoints, and copies the database safely:

```bash
# From services/api/prisma
sqlite3 dev.db ".backup 'backups/dev_backup_$(date +%Y%m%d_%H%M%S).db'"
```

#### Method B: Atomic SQL VACUUM INTO (Compatible with Node/Prisma & SQLite CLI)
SQLite 3.27.0+ supports atomic backup to an unopened target file while the system is live:

```sql
-- Executable via Prisma $executeRawUnsafe or SQLite client
VACUUM INTO 'backups/dev_backup_20261031.db';
```

#### Method C: Safe Offline File Copy with WAL Checkpoint
If copying files directly, you MUST flush the WAL journal first:

```bash
# 1. Force a WAL checkpoint to flush all pending transactions into dev.db
sqlite3 dev.db "PRAGMA wal_checkpoint(TRUNCATE);"

# 2. Verify that dev.db-wal is 0 bytes or removed
ls -la dev.db*

# 3. Safely copy the base database file
cp dev.db backups/dev_backup_checkpointed.db
```

### 2.3 Backup Verification Checklist

Never assume a backup file is valid without verifying its integrity:

```bash
# 1. Run SQLite integrity check on the backup copy
sqlite3 backups/dev_backup_20261031.db "PRAGMA integrity_check;"
# Expected Output: ok

# 2. Verify foreign key consistency
sqlite3 backups/dev_backup_20261031.db "PRAGMA foreign_key_check;"
# Expected Output: (empty / 0 errors)

# 3. Verify record counts for core pilot entities
sqlite3 backups/dev_backup_20261031.db "SELECT count(*) FROM User; SELECT count(*) FROM CarePlan; SELECT count(*) FROM HealthObservation;"
```

### 2.4 Safe Restoration Procedure

Restoring a database must never overwrite the active production or development database without creating a recovery snapshot first.

> [!CAUTION]
> **Safety Rule**: Never restore directly over `dev.db` while the API server is actively running. Stop all background API server processes before initiating restore.

```bash
# STEP 1: Terminate running API server processes
# (e.g., kill running tsx / node processes listening on port 4000)

# STEP 2: Create a safety rollback snapshot of the current state
cp services/api/prisma/dev.db services/api/prisma/dev.db.pre_restore_backup

# STEP 3: Remove lingering WAL and SHM files to prevent journal mismatch
rm -f services/api/prisma/dev.db-wal services/api/prisma/dev.db-shm

# STEP 4: Copy the verified backup into place
cp backups/dev_backup_20261031.db services/api/prisma/dev.db

# STEP 5: Verify the restored database before restarting the API
sqlite3 services/api/prisma/dev.db "PRAGMA quick_check;"

# STEP 6: Restart API server and verify authentication
npm run dev:api
```

---

## 3. Controlled Pilot Checklist

| Category | Step | Description | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- |
| **User Provisioning** | 1.1 | Synthetic Patient Account: `demo.patient1@aarogyadamu.local` | Verified with `DemoPassword123!` | [x] READY |
| | 1.2 | Clinician Account: `dr.kulkarni@aarogyadamu.local` (`isClinician: true`) | Verified with `DemoPassword123!` | [x] READY |
| | 1.3 | Caregiver Account: `meera.joshi@family.aarogyadamu.local` | Verified with `DemoPassword123!` | [x] READY |
| **Care Team Alignment** | 2.1 | Doctor-Patient Assignment | `DoctorPatientAssignment` active between Dr. Kulkarni and Ramesh Deshmukh | [x] READY |
| | 2.2 | Caregiver Consent Grant | `CaregiverConsent` active with `['VIEW_OBSERVATIONS', 'MANAGE_TASKS', 'VIEW_CARE_PLAN', 'VIEW_DOCUMENTS']` | [x] READY |
| | 2.3 | Active Care Plan v1 | Active CarePlan linked to Dr. Kulkarni with structured goals and activities | [x] READY |
| **API & Environment** | 3.1 | Core API Dev Port | Standard port 4000 (`http://localhost:4000/api`) | [x] READY |
| | 3.2 | Web Application Client | Port 5173 (`http://localhost:5173`) | [x] READY |
| | 3.3 | Android Loopback Resolution | `apps/mobile/src/api/client.ts` automatically maps `localhost` to `10.0.2.2` on Android | [x] READY |
| | 3.4 | Network Timeouts | 15s standard timeout with `AbortController` in web & mobile API clients | [x] READY |
| **Security & Privacy** | 4.1 | No Real Patient Data | All names, emails, and observations are strictly synthetic demo data | [x] READY |
| | 4.2 | Scope Enforcement | Caregiver access strictly gated by active consent permissions | [x] READY |
| | 4.3 | Cross-Patient Isolation | Unauthorized clinicians and caregivers receive 403 Forbidden | [x] READY |
| | 4.4 | Audit Logging | Scribe approval, delegated task completion, and reviews write to `AuditLog` | [x] READY |
| **Mobile Runtime** | 5.1 | Mobile TypeScript Check | 0 errors via `tsc --noEmit` | [x] READY |
| | 5.2 | Metro Bundling | 3,352 modules bundled cleanly for Android | [x] READY |
| | 5.3 | Native Android Execution | Pixel_7 AVD boots; splash screen rendered; GUI interaction stalled by display driver | [!] NOT VERIFIED |
| **Operational Health** | 6.1 | Isolated Test Runner | `scripts/run-tests.cjs` preserves `dev.db` immutability (56/56 Jest, 2/2 Vitest pass) | [x] READY |
| | 6.2 | SQLite Backup & Restore | Documented `.backup` and `VACUUM INTO` procedures verified | [x] READY |
| | 6.3 | Pilot Exit Criteria | Documented in Section 4 below | [x] READY |

---

## 4. Pilot Exit Criteria & Escalation Paths

### 4.1 Exit Criteria
A controlled pilot phase is considered successful only when:
1. All three role journeys (Patient, Doctor, Caregiver) complete their primary operational workflows without unhandled application crashes.
2. Delegated task completions are unambiguously attributed (Patient as beneficiary, Caregiver as actor).
3. Zero clinical recommendations or prescriptive changes are made autonomously by AI models.
4. Consent revocation immediately terminates all delegated caregiver access across all endpoints.
5. All synthetic test records remain strictly isolated from external systems.

### 4.2 Error Reporting & Escalation
- **Level 1 (UI / Non-blocking Glitch)**: Report to engineering team with screen capture and timestamp.
- **Level 2 (Session / Network Timeout)**: Verify that the 15-second AbortController triggers a retry banner without token leakage.
- **Level 3 (Authorization / Consent Anomaly)**: Any unauthorized cross-patient data exposure immediately pauses the pilot session, triggers an audit log dump, and notifies the security reviewer.
- **Level 4 (Data Corruption / Crash)**: Halt pilot, execute safe SQLite restoration from pre-pilot snapshot, and preserve `dev.db-wal` for post-mortem forensics.

---

## 5. Explicit Limitations & Non-Clinical-Use Warnings

1. **Investigational Only**: AarogyaDamu is not certified for clinical diagnostic or treatment decisions.
2. **Synthetic Data Mandatory**: No protected health information (PHI), real patient identifiers, or actual diagnostic reports may be loaded into the pilot instance.
3. **No Automatic Prescribing**: AI modules (Damu AI Assistant, Medical Scribe) operate strictly in assistive, read-only, and draft-generation capacities. All care plans and clinical notes require explicit human clinician sign-off.
4. **Hardware Validation Pending**: Native Android device validation is marked `NOT VERIFIED` due to host virtualization/display driver constraints.
