require('./test-db-guard.cjs').assertSafeTestDatabase();

// Prevent @prisma/client's internal dotenv loader from injecting non-test
// ADMIN_DATABASE_URL or MIGRATION_DATABASE_URL values from .env during Jest runs.
if (process.env.ADMIN_DATABASE_URL === undefined) {
  process.env.ADMIN_DATABASE_URL = '';
}
if (process.env.MIGRATION_DATABASE_URL === undefined) {
  process.env.MIGRATION_DATABASE_URL = '';
}
