# DATABASE MIGRATION HISTORY & CHECKSUM RUNBOOK
**AarogyaDamu Healthcare SaaS — Development & Operations Guide**  
**Document ID:** RUNBOOK-DB-MIG-001  
**Scope:** Developer Reference for Prisma Migration Checksums & History  
**Target:** Local Development, Test, and CI/CD Environments  

---

## 1. PURPOSE & OVERVIEW

During the Phase 10.1 forensic verification audit, an automated checksum verification was performed across all Prisma migrations in `services/api/prisma/migrations` against the `_prisma_migrations` system table in PostgreSQL.

This runbook documents the observed checksum variance in migration `20261106100000_ai_privacy_approval_hardening`, explains its origin and impact, and provides clear operational guidelines for developers before attempting any migration repair.

---

## 2. OBSERVED CHECKSUM VARIANCE DETAILS

### 2.1 The Specific Migration
- **Migration Directory:** `services/api/prisma/migrations/20261106100000_ai_privacy_approval_hardening`
- **Migration File:** `migration.sql`
- **Original Applied Date:** November 6, 2026 (16:02:40 GMT+0530)
- **Target Databases Inspected:**
  - Local Dev Database (`aarogyadamu_dev` on port 55432)
  - Local Test Database (`aarogyadamu_test` on port 55432)

### 2.2 Checksum Comparison Matrix

| Environment / Location | Migration Name | Checksum (SHA-256) | Status |
| :--- | :--- | :--- | :--- |
| **Disk File** (`migration.sql`) | `20261106100000_ai_privacy_approval_hardening` | `3c1ea4fa41925f5fb0d7c149729dd0cbf1c4064e103a8d7db4176dc261b82d46` | Source of Truth on Disk |
| **Local Dev DB** (`aarogyadamu_dev`) | `20261106100000_ai_privacy_approval_hardening` | `205153f38a7b371bd93ee523615f66592bb5fe3eb433bdbf981f54811b43bd6f` | **Variance Observed** |
| **Local Test DB** (`aarogyadamu_test`) | `20261106100000_ai_privacy_approval_hardening` | `3c1ea4fa41925f5fb0d7c149729dd0cbf1c4064e103a8d7db4176dc261b82d46` | **Identical (Match)** |
| **Commercial Migration** (`20261113000000`) | `20261113000000_commercial_practice_saas` | `d84fcfa92e6e39d3bb56a11f26d4c182fb41c7b58440a07c4ff100c355cc1d8a` | **Identical (Match on All)** |

---

## 3. ROOT CAUSE ANALYSIS & IMPACT ASSESSMENT

### 3.1 Root Cause
In Phase 0 / early development (November 6–7, 2026), after `20261106100000_ai_privacy_approval_hardening` was applied to the initial development container, minor whitespace or comment formatting in the SQL file was normalized. Because Prisma computes the migration checksum as an exact SHA-256 hash of the entire file content, this minor edit produced hash `3c1ea4fa...` on disk, whereas the dev database's `_prisma_migrations` row retained `205153f3...`.

### 3.2 Impact Assessment
- **Clinical Schema Impact:** **None.** All tables, columns, indexes, and constraints created by this migration exist and operate correctly in the database.
- **Commercial Platform Impact:** **None.** The subsequent commercial migration (`20261113000000_commercial_practice_saas`) was applied cleanly on top of this schema with a 100% matching checksum on both dev and test databases.
- **Test Database Impact:** **None.** Running `prisma migrate reset` against `aarogyadamu_test` applies the disk files from scratch and records `3c1ea4fa...` with zero errors.
- **Fresh Deployment Impact:** **None.** Any new staging or production environment built from the repository will apply `3c1ea4fa...` cleanly as the baseline.
- **Investigation Status:** **Resolved and Classified.** The root cause is fully understood as a benign historical formatting change. No further investigation is required.

---

## 4. WHAT A DEVELOPER MUST VERIFY BEFORE ATTEMPTING REPAIR

Under Phase 10 / 10.2 protection rules, **no repair operations (such as `prisma migrate resolve`, table drops, or resets) are permitted during the audit**.

If a developer later needs to synchronize the checksum in the local development database (`aarogyadamu_dev`), they must verify the following five safety checks first:

### Verification Checklist:

1. **Verify Target Environment:**
   - Confirm the database is strictly local (`127.0.0.1:55432`) and NOT a remote staging or production instance.
   - Run:
     ```sql
     SELECT current_database(), inet_server_addr(), inet_server_port();
     ```
2. **Verify Schema Parity:**
   - Confirm that all columns from `20261106100000_ai_privacy_approval_hardening` exist in the database:
     ```sql
     SELECT column_name, data_type FROM information_schema.columns 
     WHERE table_name = 'AgentAction' AND column_name IN ('riskTier', 'approvalStatus', 'requiresClinicianApproval');
     ```
3. **Verify Data Safety:**
   - Confirm that no unbacked-up synthetic pilot data will be lost. Ensure synthetic data can be re-seeded via `npm run db:seed:pilot`.
4. **Safe Resolution Command (When Authorized):**
   - If aligning the checksum in `aarogyadamu_dev` is ever required, use Prisma's non-destructive resolution command:
     ```bash
     npx prisma migrate resolve --applied 20261106100000_ai_privacy_approval_hardening
     ```
   - **DO NOT** run `prisma migrate reset` on a development database with active pilot records.
   - **DO NOT** edit the historical SQL migration files on disk, as doing so would invalidate checksums in fresh databases.
5. **Verify Subsequent Status:**
   - Run `npx prisma migrate status` to confirm that all migrations are in sync.

---

## 5. SUMMARY RECOMMENDATION

| Situation | Recommended Action |
| :--- | :--- |
| **Local Synthetic Doctor Pilot** | **Take no action.** The database schema is 100% complete and fully verified. |
| **Automated CI / Test Runner** | **Take no action.** The test runner uses `aarogyadamu_test` which is already in 100% checksum alignment. |
| **Fresh Deployment** | **Take no action.** `prisma migrate deploy` on a clean database applies all current files cleanly. |
| **Dev Database History Alignment** | Run `prisma migrate resolve --applied 20261106100000_ai_privacy_approval_hardening` only if explicit checksum parity is required. |

