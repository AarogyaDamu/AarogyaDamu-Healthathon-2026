function assertSafeTestDatabase() {
  const token = process.env.AAROGYADAMU_TEST_TOKEN;
  if (process.env.NODE_ENV !== 'test' || !token) {
    throw new Error('Refusing tests: isolated PostgreSQL test authorization is missing.');
  }

  let parsed;
  try {
    parsed = new URL(process.env.DATABASE_URL || '');
  } catch {
    throw new Error('Refusing tests: DATABASE_URL is not a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Refusing tests: tests require PostgreSQL, not a development database file.');
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error('Refusing tests: test database must be local.');
  }
  const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (!databaseName.endsWith('_test')) {
    throw new Error('Refusing tests: database name must end with _test.');
  }
}

module.exports = { assertSafeTestDatabase };
