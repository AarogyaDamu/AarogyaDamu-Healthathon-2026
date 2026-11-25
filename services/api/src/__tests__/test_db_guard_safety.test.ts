import { describe, it, expect } from '@jest/globals';
const {
  assertSafeTestDatabase,
  validateDatabaseUrl,
} = require('../../scripts/test-db-guard.cjs');

describe('Database Safety Guard Verification', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    AAROGYADAMU_TEST_TOKEN: 'valid-test-secret-token-32-chars-long',
    DATABASE_URL: 'postgresql://aarogyadamu:secret@localhost:5432/aarogyadamu_unit_test?schema=public',
  };

  describe('assertSafeTestDatabase environment safety gates', () => {
    it('accepts a fully compliant local test database configuration', () => {
      expect(() => assertSafeTestDatabase(validBaseEnv)).not.toThrow();
    });

    it('rejects execution when NODE_ENV is not "test"', () => {
      const devEnv = { ...validBaseEnv, NODE_ENV: 'development' };
      expect(() => assertSafeTestDatabase(devEnv)).toThrow(/isolated PostgreSQL test authorization is missing/i);

      const prodEnv = { ...validBaseEnv, NODE_ENV: 'production' };
      expect(() => assertSafeTestDatabase(prodEnv)).toThrow(/isolated PostgreSQL test authorization is missing/i);
    });

    it('rejects execution when AAROGYADAMU_TEST_TOKEN is missing or blank', () => {
      const missingTokenEnv = { ...validBaseEnv, AAROGYADAMU_TEST_TOKEN: '' };
      expect(() => assertSafeTestDatabase(missingTokenEnv)).toThrow(/isolated PostgreSQL test authorization is missing/i);
    });

    it('rejects unexpected non-test ADMIN_DATABASE_URL override', () => {
      const hijackedAdminEnv = {
        ...validBaseEnv,
        ADMIN_DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/aarogyadamu_dev',
      };
      expect(() => assertSafeTestDatabase(hijackedAdminEnv)).toThrow(/prohibited environment keyword 'dev'/i);
    });

    it('rejects unexpected non-test MIGRATION_DATABASE_URL override', () => {
      const hijackedMigrationEnv = {
        ...validBaseEnv,
        MIGRATION_DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/aarogyadamu_prod',
      };
      expect(() => assertSafeTestDatabase(hijackedMigrationEnv)).toThrow(/prohibited environment keyword 'prod'/i);
    });
  });

  describe('validateDatabaseUrl target safety gates', () => {
    it('accepts compliant localhost, 127.0.0.1, and ::1 URLs ending with _test', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@127.0.0.1:5432/myapp_test')).not.toThrow();
      expect(() => validateDatabaseUrl('postgres://u:p@localhost:5432/sample_run_test?schema=public')).not.toThrow();
      expect(() => validateDatabaseUrl('postgresql://u:p@[::1]:5432/suite_test')).not.toThrow();
    });

    it('rejects development database targets (aarogyadamu_dev)', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_dev')).toThrow();
    });

    it('rejects production database targets (aarogyadamu_prod / aarogyadamu_production)', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_prod')).toThrow();
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_production')).toThrow();
    });

    it('rejects staging, shadow, audit, live, and main database targets', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_staging_test')).toThrow(/prohibited environment keyword 'staging'/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_shadow_test')).toThrow(/prohibited environment keyword 'shadow'/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_audit_test')).toThrow(/prohibited environment keyword 'audit'/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_live_test')).toThrow(/prohibited environment keyword 'live'/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu_main_test')).toThrow(/prohibited environment keyword 'main'/i);
    });

    it('rejects remote or non-local host targets', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@production.database.internal:5432/isolated_test')).toThrow(/must target a local host/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@192.168.1.50:5432/isolated_test')).toThrow(/must target a local host/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@db.cloud.provider.com:5432/isolated_test')).toThrow(/must target a local host/i);
    });

    it('rejects non-PostgreSQL URLs (SQLite, MySQL, file paths)', () => {
      expect(() => validateDatabaseUrl('file:./dev.db')).toThrow(/must use postgres: or postgresql: protocol/i);
      expect(() => validateDatabaseUrl('mysql://u:p@localhost:3306/isolated_test')).toThrow(/must use postgres: or postgresql: protocol/i);
    });

    it('rejects database names that do not end with _test', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/aarogyadamu')).toThrow(/must end with '_test'/i);
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/test_database')).toThrow(/must end with '_test'/i);
    });

    it('rejects invalid or special characters in database name', () => {
      expect(() => validateDatabaseUrl('postgresql://u:p@localhost:5432/bad;drop_table_test')).toThrow();
    });
  });
});

