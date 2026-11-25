#!/usr/bin/env node
/**
 * Synchronizes production/staging PostgreSQL security vault settings and verifies
 * runtime role & RLS invariants right after `prisma migrate deploy`.
 *
 * Safe and idempotent for Render `preDeployCommand`. Never logs secrets.
 */
const path = require('node:path');
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const { PrismaClient } = require(
  require.resolve('@prisma/client', { paths: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../..')] }),
);

const DEFAULT_DEV_RLS_SECRETS = new Set([
  'aarogya_rls_signing_secret_super_secure_2026_production_key_minimum_32_chars',
  'local-dev-and-test-only-signing-secret-change-for-production',
]);

async function main() {
  const adminUrl =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL;

  if (!adminUrl) {
    throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required to provision database security state.');
  }

  const rlsSecret = process.env.RLS_CONTEXT_SECRET?.trim();
  const isDeployed = process.env.NODE_ENV === 'production' && process.env.APP_ENV !== 'development';

  if (isDeployed) {
    if (!rlsSecret || rlsSecret.length < 32 || DEFAULT_DEV_RLS_SECRETS.has(rlsSecret)) {
      throw new Error('RLS_CONTEXT_SECRET must be a distinct >= 32 character secret in staging/production.');
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    // 1. Verify runtime role aarogyadamu_app exists and cannot bypass RLS
    const roles = await prisma.$queryRawUnsafe(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = 'aarogyadamu_app'",
    );
    if (!roles || roles.length === 0) {
      throw new Error(
        'Database role "aarogyadamu_app" does not exist. Create this non-superuser role in managed PostgreSQL before deploying.',
      );
    }
    if (roles[0].rolsuper || roles[0].rolbypassrls) {
      throw new Error('Security Error: "aarogyadamu_app" must be NOSUPERUSER and NOBYPASSRLS.');
    }

    // 2. Optionally rotate aarogyadamu_app password if provided via environment secret
    const runtimePassword = process.env.APP_RUNTIME_DB_PASSWORD?.trim();
    if (runtimePassword) {
      if (runtimePassword.length < 16 || runtimePassword === 'AarogyaAppRuntime2026!') {
        throw new Error('APP_RUNTIME_DB_PASSWORD must be a rotated password of at least 16 characters.');
      }
      if (/[\u0000]/.test(runtimePassword)) {
        throw new Error('APP_RUNTIME_DB_PASSWORD contains invalid control bytes.');
      }
      const escapedSqlPassword = runtimePassword.replace(/'/g, "''");
      try {
        await prisma.$executeRawUnsafe(`ALTER ROLE aarogyadamu_app WITH LOGIN PASSWORD '${escapedSqlPassword}'`);
        console.log('Database provisioning: rotated password synced for runtime role aarogyadamu_app.');
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        if (/permission denied|must be|insufficient/i.test(msg)) {
          console.log('Database provisioning: skipping ALTER ROLE (role credentials managed via cloud dashboard).');
        } else {
          throw err;
        }
      }
    }

    // 3. Synchronize _security_vault.rls_signing_key with active RLS_CONTEXT_SECRET
    if (rlsSecret) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO _security_vault.rls_signing_key (key_id, secret)
         VALUES ('active-key', $1)
         ON CONFLICT (key_id) DO UPDATE SET secret = EXCLUDED.secret`,
        rlsSecret,
      );
      console.log('Database provisioning: synchronized _security_vault.rls_signing_key.');
    }

    // 4. Assert critical RLS, FORCE RLS, vault isolation, triggers, and AuditLog immutability invariants
    const [checks] = await prisma.$queryRawUnsafe(`
      SELECT
        pg_catalog.has_table_privilege('aarogyadamu_app', '_security_vault.rls_signing_key', 'SELECT') AS app_reads_vault,
        pg_catalog.has_table_privilege('aarogyadamu_app', 'public."AuditLog"', 'SELECT') AS app_selects_audit,
        pg_catalog.has_table_privilege('aarogyadamu_app', 'public."AuditLog"', 'INSERT') AS app_inserts_audit,
        pg_catalog.has_table_privilege('aarogyadamu_app', 'public."AuditLog"', 'UPDATE') AS app_updates_audit,
        pg_catalog.has_table_privilege('aarogyadamu_app', 'public."AuditLog"', 'DELETE') AS app_deletes_audit,
        (
          SELECT count(*)::int FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN (
              'User','PatientProfile','HealthObservation','HealthDocument','AuditLog',
              'ConsultationNote','ConsultationPrescriptionItem','ConsultationNoteVersion',
              'MedicationSchedule','MedicationAdherenceEvent','CarePlan',
              'CaregiverConsent','DoctorPatientAssignment','OcrProcessingJob','ClinicalReviewEncounter'
            )
            AND c.relrowsecurity = true
        ) AS core_rls_count,
        (
          SELECT count(*)::int FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname IN (
              'CgmDeviceConnection','CgmGlucoseReading','OcrProcessingJob',
              'OcrUsageLog','PatientCareTeamMember','ClinicalReviewEncounter'
            )
            AND c.relrowsecurity = true
            AND c.relforcerowsecurity = true
        ) AS force_rls_count,
        (
          SELECT count(*)::int FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND t.tgname IN (
              'trg_user_columns','trg_healthdocument_columns','trg_caretask_columns',
              'trg_healthobservation_columns','trg_medicationschedule_columns',
              'trg_lifestylerecord_columns','trg_reminder_columns',
              'trg_consultation_note_lifecycle','trg_prescription_item_lifecycle',
              'trg_note_version_append_only','trg_adherence_event_immutable'
            )
            AND t.tgenabled <> 'D'
        ) AS active_trigger_count
    `);

    if (checks.app_reads_vault) {
      throw new Error('Security Error: aarogyadamu_app must NOT have SELECT privilege on _security_vault.rls_signing_key.');
    }
    if (!checks.app_selects_audit || !checks.app_inserts_audit || checks.app_updates_audit || checks.app_deletes_audit) {
      throw new Error('Security Error: AuditLog grants do not match append-only least privilege for aarogyadamu_app.');
    }
    if (checks.core_rls_count < 15) {
      throw new Error(`Security Error: Expected >= 15 core clinical tables with RLS enabled, found ${checks.core_rls_count}.`);
    }
    if (checks.force_rls_count < 6) {
      throw new Error(`Security Error: Expected 6 Phase-10 tables with FORCE RLS, found ${checks.force_rls_count}.`);
    }
    if (checks.active_trigger_count < 11) {
      throw new Error(`Security Error: Expected 11 active immutability/guard triggers, found ${checks.active_trigger_count}.`);
    }

    console.log(
      `Database provisioning verified: ${checks.core_rls_count} core RLS tables, ${checks.force_rls_count} FORCE RLS tables, ${checks.active_trigger_count} active security triggers, security vault isolation, and append-only AuditLog confirmed.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Database provisioning failed:', err && err.message ? err.message : err);
  process.exit(1);
});

