const BLACKLISTED_TERMS = [
  'dev',
  'development',
  'prod',
  'production',
  'staging',
  'shadow',
  'audit',
  'live',
  'main',
];
const ALLOWED_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];
const ALLOWED_TEST_DB_REGEX = /^[a-zA-Z0-9_]+_test$/;

function validateDatabaseUrl(rawUrl, label = 'DATABASE_URL') {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error(`Refusing tests: ${label} is missing or empty.`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Refusing tests: ${label} is not a valid PostgreSQL URL.`);
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`Refusing tests: ${label} must use postgres: or postgresql: protocol.`);
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error(`Refusing tests: ${label} must target a local host (${ALLOWED_HOSTS.join(', ')}), got '${parsed.hostname}'.`);
  }

  const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (!databaseName) {
    throw new Error(`Refusing tests: ${label} does not specify a database name.`);
  }

  const lowerDb = databaseName.toLowerCase();
  for (const term of BLACKLISTED_TERMS) {
    const parts = lowerDb.split('_');
    if (parts.includes(term) || lowerDb.includes(term)) {
      throw new Error(`Refusing tests: database name '${databaseName}' in ${label} contains prohibited environment keyword '${term}'. Test operations must never target development, staging, or production data.`);
    }
  }

  if (!ALLOWED_TEST_DB_REGEX.test(databaseName)) {
    throw new Error(`Refusing tests: database name '${databaseName}' in ${label} must end with '_test' and contain only alphanumeric characters and underscores.`);
  }

  return { databaseName, hostname: parsed.hostname, protocol: parsed.protocol };
}

function assertSafeTestDatabase(env = process.env) {
  const token = env.AAROGYADAMU_TEST_TOKEN;
  if (env.NODE_ENV !== 'test' || !token) {
    throw new Error('Refusing tests: isolated PostgreSQL test authorization is missing (NODE_ENV must be "test" and AAROGYADAMU_TEST_TOKEN must be set).');
  }

  // Explicitly validate primary DATABASE_URL before test execution
  validateDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');

  // Reject unexpected or unsafe ADMIN_DATABASE_URL and MIGRATION_DATABASE_URL overrides
  if (env.ADMIN_DATABASE_URL) {
    validateDatabaseUrl(env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL');
  }
  if (env.MIGRATION_DATABASE_URL) {
    validateDatabaseUrl(env.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL');
  }
}

module.exports = {
  assertSafeTestDatabase,
  validateDatabaseUrl,
  BLACKLISTED_TERMS,
  ALLOWED_HOSTS,
  ALLOWED_TEST_DB_REGEX,
};
