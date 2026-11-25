const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { assertSafeTestDatabase } = require('./test-db-guard.cjs');

const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.resolve(__dirname, '..');
const token = crypto.randomBytes(32).toString('hex');
const configuredTestDatabaseUrl = process.env.AAROGYADAMU_TEST_DATABASE_URL ||
  'postgresql://aarogyadamu:local-audit-password@127.0.0.1:55432/aarogyadamu_test?schema=public';
const testDatabaseUrl = `${configuredTestDatabaseUrl}${configuredTestDatabaseUrl.includes('?') ? '&' : '?'}connection_limit=5&pool_timeout=60`;
const environment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  AAROGYADAMU_TEST_TOKEN: token,
  ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:8081',
  ENABLE_DEV_DEMO_MODE: 'false',
  ALLOW_DEMO_AUTH: 'false',
  JWT_SECRET: 'test-only-secret-that-is-long-enough-for-jwt-signing',
  RLS_CONTEXT_SECRET: 'aarogya_rls_signing_secret_super_secure_2026_production_key_minimum_32_chars',
  DOCTOR_INVITATION_SECRET: 'test-doctor-invitation-secret-long-enough',
  DOCTOR_INVITATION_ADMIN_KEY: 'test-admin-provisioning-key-that-is-long-enough',
  EMAIL_PROVIDER: 'disabled',
  RESEND_API_KEY: 'test-only-resend-api-key',
  EMAIL_FROM: 'security-test@aarogyadamu.local',
  WEB_APP_URL: 'http://localhost:5173',
  API_PUBLIC_URL: 'http://localhost:4000',
};
delete environment.ADMIN_DATABASE_URL;
delete environment.MIGRATION_DATABASE_URL;

function run(command, args, cwd = apiDir) {
  const result = spawnSync(command, args, { cwd, env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

assertSafeTestDatabase(environment);

run(process.execPath, [path.join(__dirname, 'prisma-command.cjs'), 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate']);
const userArgs = process.argv.slice(2);
run(process.execPath, [path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js'), '--runInBand', '--detectOpenHandles', ...userArgs]);
if (userArgs.length === 0) {
  run(process.execPath, [path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/integration/api.test.ts'], rootDir);
}
