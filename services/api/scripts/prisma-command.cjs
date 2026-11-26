const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { isHostedMode, validateHostedMigrationOnly, validateHostedDatabaseConfig } = require('./hosted-db-guard.cjs');

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const environment = { ...process.env };
// Prisma 5's database-existence probe depends on structured schema-engine logs.
// An inherited RUST_LOG can suppress schema-engine diagnostics.
delete environment.RUST_LOG;

const hosted = isHostedMode(environment);
const isMigrateCommand = process.argv.includes('migrate');

if (hosted) {
  if (process.argv.includes('dev') || process.argv.includes('reset') || process.argv.includes('push')) {
    console.error('Refusing unsafe Prisma command in hosted staging/production mode.');
    process.exit(1);
  }
  if (isMigrateCommand) {
    // Hosted deployments must NEVER silently fall back to ADMIN_DATABASE_URL or DATABASE_URL.
    const validated = environment.DATABASE_URL
      ? validateHostedDatabaseConfig(environment)
      : validateHostedMigrationOnly(environment);
    environment.DATABASE_URL = validated.migrationUrl;
  }
} else if (process.env.NODE_ENV !== 'test' && isMigrateCommand && (environment.MIGRATION_DATABASE_URL || environment.ADMIN_DATABASE_URL)) {
  // Local-development convenience fallback only (never active in hosted or test environments).
  environment.DATABASE_URL = environment.MIGRATION_DATABASE_URL || environment.ADMIN_DATABASE_URL;
}

if (process.env.NODE_ENV === 'test') {
  const { assertSafeTestDatabase } = require('./test-db-guard.cjs');
  assertSafeTestDatabase(environment);
}
const prisma = path.resolve(__dirname, '../../../node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [prisma, ...process.argv.slice(2)], { cwd: path.resolve(__dirname, '..'), env: environment, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
