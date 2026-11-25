const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const environment = { ...process.env };
// Prisma 5's database-existence probe depends on structured schema-engine logs.
// An inherited RUST_LOG can suppress schema-engine diagnostics.
delete environment.RUST_LOG;
if (process.env.NODE_ENV !== 'test' && process.argv.includes('migrate') && (environment.MIGRATION_DATABASE_URL || environment.ADMIN_DATABASE_URL)) {
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
