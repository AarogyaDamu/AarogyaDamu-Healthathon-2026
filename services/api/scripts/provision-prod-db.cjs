#!/usr/bin/env node
/**
 * Synchronizes production/staging PostgreSQL security vault settings, rotates/verifies
 * runtime credentials, and verifies role, AuditLog, RLS, FORCE RLS, and trigger invariants
 * right after `prisma migrate deploy`.
 *
 * Strictly forbids ADMIN_DATABASE_URL / DATABASE_URL fallbacks in hosted mode.
 * Fails closed on password-rotation errors. Never logs secrets.
 */
const path = require('node:path');
const {
  DEFAULT_DEV_RLS_SECRETS,
  EXPECTED_RUNTIME_ROLE,
  EXPECTED_MIGRATOR_ROLE,
  isHostedMode,
  validateHostedDatabaseConfig,
  validateRuntimePassword,
  escapeSqlStringLiteral,
  buildPrismaStrictTlsUrl,
  verifyPostgresTlsConnection,
} = require('./hosted-db-guard.cjs');

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const { PrismaClient } = require(
  require.resolve('@prisma/client', { paths: [path.resolve(__dirname, '..'), path.resolve(__dirname, '../../..')] }),
);

async function preProvisionRoles(prisma, { runtimePassword, requireCreaterole = true }) {
  const [ownerInfo] = await prisma.$queryRawUnsafe(`
    SELECT
      current_user::text AS active_user,
      r.rolsuper AS is_superuser,
      r.rolcreaterole AS can_create_role,
      current_setting('standard_conforming_strings', true) AS scs
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  `);
  if (!ownerInfo) {
    throw new Error('Unable to verify active migration owner role attributes.');
  }
  if (ownerInfo.scs !== 'on') {
    throw new Error('Database security preflight requires standard_conforming_strings=on.');
  }
  if (ownerInfo.active_user === EXPECTED_RUNTIME_ROLE || ownerInfo.active_user === EXPECTED_MIGRATOR_ROLE) {
    throw new Error(`Security Error: Migration connection cannot run as "${ownerInfo.active_user}".`);
  }
  if (requireCreaterole && !ownerInfo.is_superuser && !ownerInfo.can_create_role) {
    throw new Error(
      `Migration owner "${ownerInfo.active_user}" lacks CREATEROLE permission required to provision ${EXPECTED_RUNTIME_ROLE}.`,
    );
  }

  const escapedSqlPassword = escapeSqlStringLiteral(runtimePassword);

  // 1. Pre-provision or inspect & sync restricted runtime role `aarogyadamu_app`
  const appRoles = await prisma.$queryRawUnsafe(`
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname = '${EXPECTED_RUNTIME_ROLE}'
  `);

  if (!appRoles || appRoles.length === 0) {
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${EXPECTED_RUNTIME_ROLE} WITH LOGIN PASSWORD ${escapedSqlPassword} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
    );
    console.log(`Role preflight: created restricted runtime role "${EXPECTED_RUNTIME_ROLE}".`);
  } else {
    const existing = appRoles[0];
    if (
      existing.rolsuper ||
      existing.rolbypassrls ||
      existing.rolcreatedb ||
      existing.rolcreaterole ||
      existing.rolreplication
    ) {
      throw new Error(
        `Security Error: Pre-existing role "${EXPECTED_RUNTIME_ROLE}" holds forbidden elevated privileges (SUPERUSER/BYPASSRLS/CREATEDB/CREATEROLE/REPLICATION).`,
      );
    }
    await prisma.$executeRawUnsafe(
      `ALTER ROLE ${EXPECTED_RUNTIME_ROLE} WITH LOGIN PASSWORD ${escapedSqlPassword}`,
    );
    console.log(`Role preflight: verified and synchronized password for existing "${EXPECTED_RUNTIME_ROLE}".`);
  }

  // Re-verify post-provisioning attributes
  const [verifiedApp] = await prisma.$queryRawUnsafe(`
    SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname = '${EXPECTED_RUNTIME_ROLE}'
  `);
  if (
    !verifiedApp ||
    !verifiedApp.rolcanlogin ||
    verifiedApp.rolsuper ||
    verifiedApp.rolcreatedb ||
    verifiedApp.rolcreaterole ||
    verifiedApp.rolbypassrls ||
    verifiedApp.rolreplication
  ) {
    throw new Error(
      `Security Error: Post-provisioning verification failed for "${EXPECTED_RUNTIME_ROLE}" attributes.`,
    );
  }

  // 2. Pre-provision optional `aarogyadamu_migrator` as NOLOGIN without password so historical
  // migration 20261115160000 skips its hardcoded initial password creation path.
  const migratorRoles = await prisma.$queryRawUnsafe(`
    SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname = '${EXPECTED_MIGRATOR_ROLE}'
  `);

  if (!migratorRoles || migratorRoles.length === 0) {
    await prisma.$executeRawUnsafe(
      `CREATE ROLE ${EXPECTED_MIGRATOR_ROLE} WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
    );
    console.log(`Role preflight: pre-provisioned optional "${EXPECTED_MIGRATOR_ROLE}" as NOLOGIN.`);
  } else {
    const existingMigrator = migratorRoles[0];
    if (
      existingMigrator.rolsuper ||
      existingMigrator.rolbypassrls ||
      existingMigrator.rolcreatedb ||
      existingMigrator.rolcreaterole ||
      existingMigrator.rolreplication
    ) {
      throw new Error(
        `Security Error: Pre-existing role "${EXPECTED_MIGRATOR_ROLE}" holds forbidden elevated privileges.`,
      );
    }
    if (existingMigrator.rolcanlogin) {
      await prisma.$executeRawUnsafe(
        `ALTER ROLE ${EXPECTED_MIGRATOR_ROLE} WITH NOLOGIN PASSWORD NULL`,
      );
      console.log(`Role preflight: hardened existing "${EXPECTED_MIGRATOR_ROLE}" to NOLOGIN with cleared password.`);
    }
  }

  const [verifiedMigrator] = await prisma.$queryRawUnsafe(`
    SELECT rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname = '${EXPECTED_MIGRATOR_ROLE}'
  `);
  if (
    !verifiedMigrator ||
    verifiedMigrator.rolcanlogin ||
    verifiedMigrator.rolsuper ||
    verifiedMigrator.rolbypassrls
  ) {
    throw new Error(
      `Security Error: Post-provisioning verification failed for "${EXPECTED_MIGRATOR_ROLE}".`,
    );
  }
}

async function synchronizeAndVerifySecurityState(prisma, {
  rlsSecret,
  runtimePassword,
  hosted = true,
}) {
  // 1. Verify runtime role `aarogyadamu_app` exists and holds strictly least-privilege attributes
  const roles = await prisma.$queryRawUnsafe(`
    SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin
    FROM pg_catalog.pg_roles
    WHERE rolname = '${EXPECTED_RUNTIME_ROLE}'
  `);
  if (!roles || roles.length === 0) {
    throw new Error(
      `Database role "${EXPECTED_RUNTIME_ROLE}" does not exist.`,
    );
  }
  const roleInfo = roles[0];
  if (
    !roleInfo.rolcanlogin ||
    roleInfo.rolsuper ||
    roleInfo.rolbypassrls ||
    roleInfo.rolcreatedb ||
    roleInfo.rolcreaterole ||
    roleInfo.rolreplication
  ) {
    throw new Error(
      `Security Error: "${EXPECTED_RUNTIME_ROLE}" must be LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION.`,
    );
  }

  // 2. Synchronize `_security_vault.rls_signing_key` with active `RLS_CONTEXT_SECRET`
  if (rlsSecret) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO _security_vault.rls_signing_key (key_id, secret)
       VALUES ('active-key', $1)
       ON CONFLICT (key_id) DO UPDATE SET secret = EXCLUDED.secret`,
      rlsSecret,
    );
    console.log('Database provisioning: synchronized _security_vault.rls_signing_key.');
  } else if (hosted) {
    throw new Error('RLS_CONTEXT_SECRET is required to synchronize _security_vault.rls_signing_key.');
  }

  // 3. Synchronize runtime password using `APP_RUNTIME_DB_PASSWORD` (fail closed in hosted mode!)
  if (runtimePassword) {
    const validatedPassword = validateRuntimePassword(runtimePassword);
    const escapedSqlPassword = escapeSqlStringLiteral(validatedPassword);
    try {
      await prisma.$executeRawUnsafe(
        `ALTER ROLE ${EXPECTED_RUNTIME_ROLE} WITH LOGIN PASSWORD ${escapedSqlPassword}`,
      );
      console.log(`Database provisioning: rotated password synced for runtime role ${EXPECTED_RUNTIME_ROLE}.`);
    } catch (err) {
      const msg = err && err.message ? String(err.message).replace(/\r?\n/g, ' ') : 'unknown error';
      throw new Error(
        `Database provisioning failed: unable to synchronize password for ${EXPECTED_RUNTIME_ROLE} (${msg.slice(0, 160)}).`,
      );
    }
  } else if (hosted) {
    throw new Error('APP_RUNTIME_DB_PASSWORD is required in hosted deployments.');
  }

  // 4. Verify role privileges, AuditLog append-only grants, RLS, FORCE RLS, and triggers
  const [checks] = await prisma.$queryRawUnsafe(`
    SELECT
      pg_catalog.has_schema_privilege('${EXPECTED_RUNTIME_ROLE}', '_security_vault', 'USAGE') AS app_has_vault_schema,
      EXISTS (
        SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = '${EXPECTED_RUNTIME_ROLE}'
          AND table_schema = '_security_vault'
      ) AS app_has_vault_table_grant,
      pg_catalog.has_table_privilege('${EXPECTED_RUNTIME_ROLE}', 'public."_prisma_migrations"', 'SELECT') AS app_selects_migrations,
      pg_catalog.has_table_privilege('${EXPECTED_RUNTIME_ROLE}', 'public."AuditLog"', 'SELECT') AS app_selects_audit,
      pg_catalog.has_table_privilege('${EXPECTED_RUNTIME_ROLE}', 'public."AuditLog"', 'INSERT') AS app_inserts_audit,
      pg_catalog.has_table_privilege('${EXPECTED_RUNTIME_ROLE}', 'public."AuditLog"', 'UPDATE') AS app_updates_audit,
      pg_catalog.has_table_privilege('${EXPECTED_RUNTIME_ROLE}', 'public."AuditLog"', 'DELETE') AS app_deletes_audit,
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

  if (checks.app_has_vault_schema || checks.app_has_vault_table_grant) {
    throw new Error(`Security Error: ${EXPECTED_RUNTIME_ROLE} must NOT have privileges on _security_vault.`);
  }
  if (checks.app_selects_migrations) {
    throw new Error(`Security Error: ${EXPECTED_RUNTIME_ROLE} must NOT have SELECT privilege on _prisma_migrations.`);
  }
  if (!checks.app_selects_audit || !checks.app_inserts_audit || checks.app_updates_audit || checks.app_deletes_audit) {
    throw new Error(`Security Error: AuditLog grants do not match append-only least privilege for ${EXPECTED_RUNTIME_ROLE}.`);
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

  return checks;
}

async function main() {
  const hosted = isHostedMode(process.env);
  let migrationUrl;
  let rlsSecret;
  let runtimePassword;

  if (hosted) {
    const validated = validateHostedDatabaseConfig(process.env);
    await verifyPostgresTlsConnection(validated.migrationUrl, { label: 'MIGRATION_DATABASE_URL' });
    migrationUrl = buildPrismaStrictTlsUrl(validated.migrationUrl);
    rlsSecret = validated.rlsSecret;
    runtimePassword = validated.runtimePassword;
  } else {
    // Local development only: allow fallback cleanly outside NODE_ENV=production hosted modes.
    migrationUrl =
      process.env.MIGRATION_DATABASE_URL?.trim() ||
      process.env.ADMIN_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim();
    if (!migrationUrl) {
      throw new Error('MIGRATION_DATABASE_URL, ADMIN_DATABASE_URL, or DATABASE_URL is required in local development.');
    }
    rlsSecret = process.env.RLS_CONTEXT_SECRET?.trim() || undefined;
    runtimePassword = process.env.APP_RUNTIME_DB_PASSWORD?.trim() || undefined;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: migrationUrl } } });
  try {
    await synchronizeAndVerifySecurityState(prisma, {
      rlsSecret,
      runtimePassword,
      hosted,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Database provisioning failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  preProvisionRoles,
  synchronizeAndVerifySecurityState,
  DEFAULT_DEV_RLS_SECRETS,
};

