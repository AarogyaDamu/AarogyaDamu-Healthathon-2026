#!/usr/bin/env node
/**
 * Render Free + Neon Free idempotent startup deployment automation.
 *
 * Strict 15-step preflight & migration sequence:
 *  1. Validate both database URLs, SSL, role expectations, and Neon endpoint identity.
 *  2. Connect using MIGRATION_DATABASE_URL.
 *  3. Pre-provision or safely verify `aarogyadamu_app` (LOGIN) & `aarogyadamu_migrator` (NOLOGIN).
 *  4. Apply Prisma migrations using MIGRATION_DATABASE_URL.
 *  5. Synchronize `_security_vault.rls_signing_key` using RLS_CONTEXT_SECRET.
 *  6. Synchronize runtime password using APP_RUNTIME_DB_PASSWORD (fail closed).
 *  7. Verify role privileges, schema vault isolation, and RLS policies.
 *  8. Verify AuditLog append-only privileges.
 *  9. Verify FORCE RLS and required security triggers.
 * 10. Connect using DATABASE_URL authenticated with APP_RUNTIME_DB_PASSWORD.
 * 11. Verify actual connected role (`current_user` & `session_user`) is `aarogyadamu_app`.
 * 12. Verify connected role is NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION.
 * 13. Verify `_security_vault` access is rejected with SQLSTATE 42501.
 * 14. Verify unscoped HealthDocument queries return 0 rows.
 * 15. Exit 0 only when every invariant passes so the API server may start listening.
 *
 * Never logs secrets, passwords, or full database URLs.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  EXPECTED_RUNTIME_ROLE,
  validateHostedDatabaseConfig,
  buildRuntimeUrlWithPassword,
  sanitizeConnectionSummary,
} = require('./hosted-db-guard.cjs');
const {
  preProvisionRoles,
  synchronizeAndVerifySecurityState,
} = require('./provision-prod-db.cjs');

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const apiRoot = path.resolve(__dirname, '..');
const { PrismaClient } = require(
  require.resolve('@prisma/client', { paths: [apiRoot, path.resolve(apiRoot, '../..')] }),
);

async function verifyMigrationSslAndIdentity(migrationPrisma, { expectedOwnerRole, requireSsl = true }) {
  const [conn] = await migrationPrisma.$queryRawUnsafe(`
    SELECT
      current_user::text AS active_user,
      session_user::text AS session_user,
      COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_active
  `);
  if (!conn || conn.active_user !== expectedOwnerRole) {
    throw new Error(
      `Security Error: Expected migration role "${expectedOwnerRole}", got "${conn ? conn.active_user : 'unknown'}".`,
    );
  }
  if (requireSsl && !conn.ssl_active) {
    throw new Error('Security Error: Migration connection is not encrypted with SSL/TLS.');
  }
  return conn;
}

function runPrismaDeploy(env = process.env) {
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, 'prisma-command.cjs'), 'migrate', 'deploy'],
    {
      cwd: apiRoot,
      env,
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy exited with status ${result.status ?? 1}`);
  }
}

async function verifyRuntimeDatabaseIsolation(runtimeUrl, {
  expectedPassword,
  requireSsl = true,
} = {}) {
  const authUrl = expectedPassword
    ? buildRuntimeUrlWithPassword(runtimeUrl, expectedPassword)
    : runtimeUrl;

  const runtimePrisma = new PrismaClient({ datasources: { db: { url: authUrl } } });
  try {
    const roleRows = await runtimePrisma.$queryRawUnsafe(`
      SELECT
        current_user::text AS active_user,
        session_user::text AS session_user,
        r.rolsuper AS is_superuser,
        r.rolbypassrls AS can_bypass_rls,
        r.rolcreatedb AS can_create_db,
        r.rolcreaterole AS can_create_role,
        r.rolreplication AS can_replicate,
        r.rolcanlogin AS can_login,
        COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl_active
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = current_user
    `);
    const role = roleRows && roleRows[0];
    if (!role) {
      throw new Error('Unable to inspect active runtime database role.');
    }
    if (role.active_user !== EXPECTED_RUNTIME_ROLE || role.session_user !== EXPECTED_RUNTIME_ROLE) {
      throw new Error(
        `Security Error: Expected runtime role "${EXPECTED_RUNTIME_ROLE}", connected as "${role.active_user}" (session "${role.session_user}").`,
      );
    }
    if (
      role.is_superuser ||
      role.can_bypass_rls ||
      role.can_create_db ||
      role.can_create_role ||
      role.can_replicate ||
      !role.can_login
    ) {
      throw new Error(
        `Runtime role "${role.active_user}" holds forbidden elevated attributes in hosted deployment.`,
      );
    }
    if (requireSsl && !role.ssl_active) {
      throw new Error('Security Error: Runtime DATABASE_URL connection is not encrypted with SSL/TLS.');
    }

    const schemaPrivRows = await runtimePrisma.$queryRawUnsafe(`
      SELECT
        pg_catalog.has_schema_privilege(current_user, '_security_vault', 'USAGE') AS has_vault_schema,
        pg_catalog.has_table_privilege(current_user, 'public."_prisma_migrations"', 'SELECT') AS can_read_migrations
    `);
    const privs = schemaPrivRows && schemaPrivRows[0];
    if (privs && privs.has_vault_schema) {
      throw new Error(
        `Runtime role "${role.active_user}" must not have USAGE privilege on schema _security_vault.`,
      );
    }
    if (privs && privs.can_read_migrations) {
      throw new Error(
        `Runtime role "${role.active_user}" must not have SELECT privilege on _prisma_migrations.`,
      );
    }

    let vaultQueryBlocked = false;
    try {
      await runtimePrisma.$queryRawUnsafe('SELECT secret FROM _security_vault.rls_signing_key LIMIT 1');
    } catch (vaultErr) {
      const msg = vaultErr && vaultErr.message ? vaultErr.message : String(vaultErr);
      if (/42501|permission denied/i.test(msg)) {
        vaultQueryBlocked = true;
      } else {
        throw vaultErr;
      }
    }
    if (!vaultQueryBlocked) {
      throw new Error(
        `Runtime role "${role.active_user}" unexpectedly read _security_vault.rls_signing_key.`,
      );
    }

    const unscopedRows = await runtimePrisma.$queryRawUnsafe(
      'SELECT count(*)::int AS unscoped_count FROM public."HealthDocument"',
    );
    const unscopedCount = Number(unscopedRows && unscopedRows[0] ? unscopedRows[0].unscoped_count : 0);
    if (unscopedCount !== 0) {
      throw new Error(
        `RLS fail-closed check failed: unscoped query returned ${unscopedCount} HealthDocument rows instead of 0.`,
      );
    }

    console.log(
      `Hosted DB runtime verification passed for "${role.active_user}" (SSL=${role.ssl_active}, NOSUPERUSER, NOBYPASSRLS, _security_vault 42501 denied, unscoped HealthDocument count=0).`,
    );
  } finally {
    await runtimePrisma.$disconnect();
  }
}

async function executeDeploymentSequence({
  migrationUrl,
  runtimeUrl,
  expectedOwnerRole,
  runtimePassword,
  rlsSecret,
  requireSsl = true,
  migrateFn,
}) {
  const migrationPrisma = new PrismaClient({ datasources: { db: { url: migrationUrl } } });
  try {
    console.log('Hosted deploy step 2-3/6: verifying owner SSL connection and pre-provisioning restricted roles...');
    await verifyMigrationSslAndIdentity(migrationPrisma, { expectedOwnerRole, requireSsl });
    await preProvisionRoles(migrationPrisma, { runtimePassword, requireCreaterole: true });
  } finally {
    await migrationPrisma.$disconnect();
  }

  console.log('Hosted deploy step 4/6: applying Prisma production migrations via MIGRATION_DATABASE_URL...');
  migrateFn();

  const postMigratePrisma = new PrismaClient({ datasources: { db: { url: migrationUrl } } });
  try {
    console.log('Hosted deploy step 5-9/6: syncing vault secret, rotating runtime password, and verifying RLS/AuditLog/triggers...');
    await synchronizeAndVerifySecurityState(postMigratePrisma, {
      rlsSecret,
      runtimePassword,
      hosted: true,
    });
  } finally {
    await postMigratePrisma.$disconnect();
  }

  console.log('Hosted deploy step 10-14/6: verifying pooled runtime connection, password auth, _security_vault 42501, and unscoped isolation...');
  await verifyRuntimeDatabaseIsolation(runtimeUrl, {
    expectedPassword: runtimePassword,
    requireSsl,
  });
  console.log('Hosted deploy step 15/6: all database security preflight & runtime checks passed.');
}

async function main() {
  console.log('Hosted deploy step 1/6: validating Neon endpoint identity, URL separation, SSL, and credentials...');
  const config = validateHostedDatabaseConfig(process.env);
  console.log(
    `Validated target Neon host "${config.expectedEndpoint.baseHost}" (migration: ${sanitizeConnectionSummary(config.migration)}; runtime: ${sanitizeConnectionSummary(config.runtime)}).`,
  );

  await executeDeploymentSequence({
    migrationUrl: config.migrationUrl,
    runtimeUrl: config.runtimeUrl,
    expectedOwnerRole: config.expectedOwnerRole,
    runtimePassword: config.runtimePassword,
    rlsSecret: config.rlsSecret,
    requireSsl: true,
    migrateFn: () => runPrismaDeploy(process.env),
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Hosted database deploy/provision failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  verifyMigrationSslAndIdentity,
  runPrismaDeploy,
  verifyRuntimeDatabaseIsolation,
  executeDeploymentSequence,
  main,
};
