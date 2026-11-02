const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const rootDir = path.resolve(__dirname, '../../..');
const apiDir = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aarogyadamu-test-'));
const token = crypto.randomBytes(32).toString('hex');
fs.writeFileSync(path.join(dir, '.test-marker'), token, { flag: 'wx' });
const environment = { ...process.env, NODE_ENV: 'test', DATABASE_URL: `file:${path.join(dir, 'test.db').replace(/\\/g, '/')}`, AAROGYADAMU_TEST_DIR: dir, AAROGYADAMU_TEST_TOKEN: token, ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:8081', ENABLE_DEV_DEMO_MODE: 'false', JWT_SECRET: 'test-only-secret-that-is-long-enough-for-jwt-signing', DOCTOR_INVITATION_SECRET: 'test-doctor-invitation-secret-long-enough', DOCTOR_INVITATION_ADMIN_KEY: 'test-admin-provisioning-key-that-is-long-enough', EMAIL_PROVIDER: 'disabled', RESEND_API_KEY: 'test-only-resend-api-key', EMAIL_FROM: 'security-test@aarogyadamu.local', WEB_APP_URL: 'http://localhost:5173', API_PUBLIC_URL: 'http://localhost:4000' };
function run(command, args, cwd = apiDir) {
  const result = spawnSync(command, args, { cwd, env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, [path.join(__dirname, 'prisma-command.cjs'), 'migrate', 'deploy']);
run(process.execPath, [path.join(rootDir, 'node_modules', 'jest', 'bin', 'jest.js'), '--runInBand', '--detectOpenHandles']);
run(process.execPath, [path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs'), 'run', 'tests/integration/api.test.ts'], rootDir);
