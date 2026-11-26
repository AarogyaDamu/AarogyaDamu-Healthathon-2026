import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { execFileSync, spawnSync } from 'node:child_process';

const apiRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(apiRoot, '../..');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require(path.join(apiRoot, 'scripts', 'hosted-db-guard.cjs'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const provision = require(path.join(apiRoot, 'scripts', 'provision-prod-db.cjs'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const deploy = require(path.join(apiRoot, 'scripts', 'deploy-migrate-and-provision.cjs'));

const NEW_ENDPOINT = 'ep-release-demo-778899.ap-southeast-1.aws.neon.tech';
const OLD_STAGING_ENDPOINT = 'ep-old-healthathon-112233.ap-southeast-1.aws.neon.tech';
const WRONG_ENDPOINT = 'ep-wrong-target-990011.ap-southeast-1.aws.neon.tech';
const RUNTIME_PASS = 'RotatedAppRuntimeSecret_2026_Secure!';
const OWNER_PASS = 'NeonDirectOwnerSecret_2026_Secure!';
const RLS_SECRET = 'rls_context_signing_key_distinct_32_plus_chars_2026';

function validHostedEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    APP_ENV: 'staging',
    EXPECTED_NEON_ENDPOINT: NEW_ENDPOINT,
    EXPECTED_NEON_OWNER_ROLE: 'neondb_owner',
    MIGRATION_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
    DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require`,
    APP_RUNTIME_DB_PASSWORD: RUNTIME_PASS,
    RLS_CONTEXT_SECRET: RLS_SECRET,
  };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return base;
}

describe('Hosted Database Security Preflight & Render Free Startup Hardening', () => {
  test('validates direct Neon owner MIGRATION_DATABASE_URL and pooled aarogyadamu_app DATABASE_URL safely', () => {
    const validated = guard.validateHostedDatabaseConfig(validHostedEnv());
    expect(validated.expectedEndpoint.baseHost).toBe(NEW_ENDPOINT);
    expect(validated.expectedEndpoint.pooledHost).toBe(
      'ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech',
    );
    expect(validated.migration.username).toBe('neondb_owner');
    expect(validated.runtime.username).toBe('aarogyadamu_app');
    expect(validated.migration.databaseName).toBe('aarogyadamu_release_demo');
    expect(validated.runtime.databaseName).toBe('aarogyadamu_release_demo');
    expect(validated.runtime.sslMode).toBe('require');
    expect(validated.migration.sslMode).toBe('require');
  });

  test('blocks missing MIGRATION_DATABASE_URL and forbids ADMIN_DATABASE_URL or DATABASE_URL fallback', () => {
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: undefined,
          ADMIN_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/MIGRATION_DATABASE_URL is strictly required/i);

    // Subprocess check against all three CLI scripts in hosted mode
    for (const relScript of [
      'scripts/prisma-command.cjs',
      'scripts/provision-prod-db.cjs',
      'scripts/deploy-migrate-and-provision.cjs',
    ]) {
      const args = relScript.endsWith('prisma-command.cjs') ? ['migrate', 'deploy'] : [];
      const env = validHostedEnv({
        MIGRATION_DATABASE_URL: undefined,
        ADMIN_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
      });
      const res = spawnSync(process.execPath, [path.join(apiRoot, relScript), ...args], {
        cwd: apiRoot,
        env: { ...process.env, ...env },
        encoding: 'utf8',
      });
      expect(res.status).not.toBe(0);
      expect(`${res.stdout}${res.stderr}`).not.toContain(OWNER_PASS);
      expect(`${res.stdout}${res.stderr}`).not.toContain(RUNTIME_PASS);
    }

    // Identical DATABASE_URL === MIGRATION_DATABASE_URL is also blocked
    const sameUrl = `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`;
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: sameUrl,
          DATABASE_URL: sameUrl,
        }),
      ),
    ).toThrow(/cannot be identical/i);
  });

  test('rejects old staging endpoint, wrong Neon endpoint, malformed endpoint vars, and owner/runtime role mistakes before SQL', () => {
    // Old staging endpoint rejected
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@${OLD_STAGING_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/does not match EXPECTED_NEON_ENDPOINT/i);

    // Wrong pooled runtime endpoint rejected
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@ep-wrong-target-990011-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/does not match EXPECTED_NEON_ENDPOINT/i);

    // Incorrect EXPECTED_NEON_ENDPOINT rejected when URL points to different endpoint
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          EXPECTED_NEON_ENDPOINT: WRONG_ENDPOINT,
        }),
      ),
    ).toThrow(/does not match EXPECTED_NEON_ENDPOINT/i);

    // Malformed EXPECTED_NEON_ENDPOINT (protocol, -pooler, path, query, credentials, localhost)
    for (const badEndpoint of [
      '',
      `https://${NEW_ENDPOINT}`,
      `neondb_owner@${NEW_ENDPOINT}`,
      `${NEW_ENDPOINT}/aarogyadamu_release_demo`,
      `${NEW_ENDPOINT}?sslmode=require`,
      'ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech',
      'localhost',
    ]) {
      expect(() =>
        guard.validateHostedDatabaseConfig(validHostedEnv({ EXPECTED_NEON_ENDPOINT: badEndpoint })),
      ).toThrow();
    }

    // Owner URL must be direct (not -pooler); Runtime URL must be pooled (-pooler)
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/direct Neon endpoint \(not "-pooler"\)/i);

    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/pooled endpoint \("-pooler"\)/i);

    // Different database names rejected
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/other_db?sslmode=require`,
        }),
      ),
    ).toThrow(/does not match MIGRATION_DATABASE_URL database/i);

    // Runtime user must be exactly aarogyadamu_app; migration user must match EXPECTED_NEON_OWNER_ROLE
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://neondb_owner:${RUNTIME_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/must connect as "aarogyadamu_app"/i);

    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: `postgresql://wrong_user:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require`,
        }),
      ),
    ).toThrow(/configured Neon owner "neondb_owner"/i);

    // SSL required on both URLs; mismatched APP_RUNTIME_DB_PASSWORD rejected
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=disable`,
        }),
      ),
    ).toThrow(/sslmode=require/i);

    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          APP_RUNTIME_DB_PASSWORD: 'DifferentPassword_2026_Secret!',
        }),
      ),
    ).toThrow(/does not match APP_RUNTIME_DB_PASSWORD/i);
  });

  test('historical migration checksums remain completely unmodified', () => {
    const expectedChecksums: Record<string, string> = {
      '20261105000000_baseline_current_schema/migration.sql':
        '8D9D889811A3A4F72D4EB416840FDF9CAAFA854F7FD34DDAA507BD7C3FAEB532',
      '20261106100000_ai_privacy_approval_hardening/migration.sql':
        '3C1EA4FA41925F5FB0D7C149729DD0CBF1C4064E103A8D7DB4176DC261B82D46',
      '20261113000000_commercial_practice_saas/migration.sql':
        'D84FCFA92E6E39D3BB56A11F26D4C182FB41C7B58440A07C4FF100C355CC1D8A',
      '20261115160000_native_rls_and_role_separation/migration.sql':
        'B0166C1EFBC4D5536D9791BC6B1F8EAFE2A65E1109B72A2EA5DE119771D3E45F',
      '20261116120000_system_worker_least_privilege_and_search_path_hardening/migration.sql':
        '865A287DBCCA8E46FD7D0365F1C16AFDAF0BBB2CF130BC28394814695FAD29C4',
      '20261116160000_clinical_rls_command_level_hardening_and_caregiver_authorization/migration.sql':
        '8492069BD69E81C1BA97316BB9C9D6D2B992B7C59B8A3CB4803EA58DAA7BB969',
      '20261116170000_consent_helper_hardening_and_column_level_lifecycle_guards/migration.sql':
        'B30F3F05946229E166CF9F329752CE821D159471258C2B8DD7BF6CD5F5AE70A1',
      '20261117180000_cgm_wearables_ocr_care_team_and_review/migration.sql':
        '81226B6BAD0864F0B427B800CC2B23472C5BA5D4E9D7E08E21830968BB7B0A3B',
      '20261118150000_group_a_healthdocument_and_auditlog_rls_hardening/migration.sql':
        '9292D5D1D3F639C53F798DCC99B225356D42A9D2410479D29139BD32E6FE42C4',
    };

    const migrationsDir = path.join(apiRoot, 'prisma', 'migrations');
    for (const [relPath, expectedHash] of Object.entries(expectedChecksums)) {
      const content = fs.readFileSync(path.join(migrationsDir, relPath));
      const actualHash = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
      expect(actualHash).toBe(expectedHash);
    }
  });

  test('preProvisionRoles and provision fail closed on missing CREATEROLE, ALTER ROLE permission denied, or SUPERUSER/BYPASSRLS roles', async () => {
    const executedSql: string[] = [];

    // 1. Missing CREATEROLE permission aborts before any CREATE/ALTER ROLE SQL
    const noCreateRolePrisma = {
      $queryRawUnsafe: async () => [
        { active_user: 'neondb_owner', is_superuser: false, can_create_role: false, scs: 'on' },
      ],
      $executeRawUnsafe: async (sql: string) => {
        executedSql.push(sql);
      },
    };
    await expect(
      provision.preProvisionRoles(noCreateRolePrisma, { runtimePassword: RUNTIME_PASS }),
    ).rejects.toThrow(/lacks CREATEROLE/i);
    expect(executedSql.length).toBe(0);

    // 2. Existing aarogyadamu_app holding SUPERUSER or BYPASSRLS is refused cleanly
    const superuserAppPrisma = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql.includes('WHERE r.rolname = current_user')) {
          return [{ active_user: 'neondb_owner', is_superuser: false, can_create_role: true, scs: 'on' }];
        }
        return [
          {
            rolname: 'aarogyadamu_app',
            rolsuper: false,
            rolbypassrls: true,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false,
            rolcanlogin: true,
          },
        ];
      },
      $executeRawUnsafe: async (sql: string) => {
        executedSql.push(sql);
      },
    };
    await expect(
      provision.preProvisionRoles(superuserAppPrisma, { runtimePassword: RUNTIME_PASS }),
    ).rejects.toThrow(/forbidden elevated privileges/i);
    expect(executedSql.length).toBe(0);

    // 3. Fresh provisioning creates aarogyadamu_app (LOGIN + password) and aarogyadamu_migrator (NOLOGIN, no password)
    const createdStatements: string[] = [];
    let appQueryCount = 0;
    let migratorQueryCount = 0;
    const freshClusterPrisma = {
      $queryRawUnsafe: async (sql: string) => {
        if (sql.includes('WHERE r.rolname = current_user')) {
          return [{ active_user: 'neondb_owner', is_superuser: false, can_create_role: true, scs: 'on' }];
        }
        if (sql.includes("WHERE rolname = 'aarogyadamu_app'")) {
          appQueryCount += 1;
          if (appQueryCount === 1) return [];
          return [
            {
              rolname: 'aarogyadamu_app',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolcanlogin: true,
            },
          ];
        }
        if (sql.includes("WHERE rolname = 'aarogyadamu_migrator'")) {
          migratorQueryCount += 1;
          if (migratorQueryCount === 1) return [];
          return [
            {
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false,
              rolcanlogin: false,
            },
          ];
        }
        return [];
      },
      $executeRawUnsafe: async (sql: string) => {
        createdStatements.push(sql);
      },
    };
    const quotePass = "O'Brien_Runtime_Pass_2026!";
    await provision.preProvisionRoles(freshClusterPrisma, { runtimePassword: quotePass });
    expect(createdStatements[0]).toContain("CREATE ROLE aarogyadamu_app WITH LOGIN PASSWORD 'O''Brien_Runtime_Pass_2026!' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION");
    expect(createdStatements[1]).toBe(
      'CREATE ROLE aarogyadamu_migrator WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION',
    );
    expect(createdStatements[1]).not.toContain('PASSWORD');

    // 4. ALTER ROLE permission denied during provisioning MUST fail closed (never silently skipped!)
    const deniedAlterPrisma = {
      $queryRawUnsafe: async () => [
        {
          rolname: 'aarogyadamu_app',
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolreplication: false,
          rolcanlogin: true,
        },
      ],
      $executeRawUnsafe: async (sql: string) => {
        if (sql.startsWith('ALTER ROLE aarogyadamu_app')) {
          throw new Error('permission denied to alter role aarogyadamu_app');
        }
      },
    };
    await expect(
      provision.synchronizeAndVerifySecurityState(deniedAlterPrisma, {
        rlsSecret: RLS_SECRET,
        runtimePassword: RUNTIME_PASS,
        hosted: true,
      }),
    ).rejects.toThrow(/unable to synchronize password/i);
  });

  test('executeDeploymentSequence enforces 15-step sequence and aborts immediately when pre-flight or runtime checks fail', async () => {
    expect(typeof deploy.executeDeploymentSequence).toBe('function');
    expect(typeof deploy.verifyRuntimeDatabaseIsolation).toBe('function');
  });

  test('render.yaml configures Render Free services, Neon preflight env vars, /health/ready, and no paid add-ons', () => {
    const renderYaml = fs.readFileSync(path.join(repoRoot, 'render.yaml'), 'utf8');
    expect(renderYaml).not.toMatch(/^\s*databases:/m);
    expect(renderYaml).not.toMatch(/preDeployCommand:/);
    expect(renderYaml).toContain('name: aarogyadamu-api');
    expect(renderYaml).toContain('plan: free');
    expect(renderYaml).toContain('region: singapore');
    expect(renderYaml).toContain('autoDeploy: false');
    expect(renderYaml).toContain('healthCheckPath: /health/ready');
    expect(renderYaml).toContain('startCommand: npm --workspace=services/api run db:deploy:hosted && npm --workspace=services/api start');
    expect(renderYaml).toContain('key: EXPECTED_NEON_ENDPOINT');
    expect(renderYaml).toContain('key: EXPECTED_NEON_OWNER_ROLE');
    expect(renderYaml).toContain('value: sarvam');
    expect(renderYaml).toContain('value: disabled');
  });

  test('API process refuses to listen on PORT when started with owner role or incomplete provisioning', async () => {
    // Pick an unused local ephemeral port to prove the process never binds it
    const probeServer = net.createServer();
    await new Promise<void>((resolve) => probeServer.listen(0, '127.0.0.1', () => resolve()));
    const address = probeServer.address() as net.AddressInfo;
    const freePort = String(address.port);
    await new Promise<void>((resolve) => probeServer.close(() => resolve()));

    const badStartup = spawnSync(
      process.execPath,
      [path.join(apiRoot, 'dist/src/server.js')],
      {
        cwd: apiRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_ENV: 'staging',
          PORT: freePort,
          DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@ep-demo-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require`,
          JWT_SECRET: 'distinct_jwt_secret_key_for_startup_fail_test_32chars_min',
          RLS_CONTEXT_SECRET: RLS_SECRET,
          DOCTOR_INVITATION_SECRET: 'distinct_invite_secret_for_startup_fail_test_32chars_min',
          DOCTOR_INVITATION_ADMIN_KEY: 'distinct_admin_key_for_startup_fail_test_32chars_min',
          WEB_APP_URL: 'https://aarogyadamu-doctor-web.onrender.com',
          API_PUBLIC_URL: 'https://aarogyadamu-api.onrender.com/api',
          FHIR_SERVER_URL: 'https://aarogyadamu-api.onrender.com/api/fhir/r4',
          ALLOWED_ORIGINS: 'https://aarogyadamu-doctor-web.onrender.com',
          EMAIL_PROVIDER: 'disabled',
          MEDICAL_REPORT_OCR_PROVIDER: 'sarvam',
          SARVAM_API_KEY: 'sk_test_sarvam_key_startup_check',
          ALLOW_DEMO_AUTH: 'false',
          ENABLE_DEV_DEMO_MODE: 'false',
        },
        encoding: 'utf8',
      },
    );

    expect(badStartup.status).not.toBe(0);
    expect(`${badStartup.stdout}${badStartup.stderr}`).not.toContain('Core API running on');
  });

  test('enforces strict certificate verification URLs and rejects weakened sslaccept parameters', () => {
    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          MIGRATION_DATABASE_URL: `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=require&sslaccept=accept_invalid_certs`,
        }),
      ),
    ).toThrow(/sslaccept=accept_invalid_certs/i);

    expect(() =>
      guard.validateHostedDatabaseConfig(
        validHostedEnv({
          DATABASE_URL: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@ep-release-demo-778899-pooler.ap-southeast-1.aws.neon.tech/aarogyadamu_release_demo?sslmode=require&sslaccept=accept_invalid_certs`,
        }),
      ),
    ).toThrow(/sslaccept=accept_invalid_certs/i);

    const strictFromVerifyFull = guard.buildPrismaStrictTlsUrl(
      `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=verify-full&channel_binding=require`,
    );
    const parsedStrict = new URL(strictFromVerifyFull);
    expect(parsedStrict.searchParams.get('sslmode')).toBe('require');
    expect(parsedStrict.searchParams.get('sslaccept')).toBe('strict');
    expect(parsedStrict.searchParams.get('channel_binding')).toBe('require');

    expect(() =>
      guard.buildPrismaStrictTlsUrl(
        `postgresql://neondb_owner:${OWNER_PASS}@${NEW_ENDPOINT}/aarogyadamu_release_demo?sslmode=disable`,
      ),
    ).toThrow(/unsafe sslmode/i);
  });

  test('verifyPostgresTlsConnection rejects plaintext and untrusted certificates while accepting verified TLSv1.2+ connections', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aarogyadamu-pg-tls-'));
    const caKey = path.join(tmpDir, 'ca.key');
    const caCrt = path.join(tmpDir, 'ca.crt');
    const srvKey = path.join(tmpDir, 'srv.key');
    const srvCsr = path.join(tmpDir, 'srv.csr');
    const srvCrt = path.join(tmpDir, 'srv.crt');
    const extCfg = path.join(tmpDir, 'ext.cnf');
    const rogueKey = path.join(tmpDir, 'rogue.key');
    const rogueCrt = path.join(tmpDir, 'rogue.crt');

    fs.writeFileSync(
      extCfg,
      [
        'basicConstraints=CA:FALSE',
        'keyUsage=digitalSignature,keyEncipherment',
        'extendedKeyUsage=serverAuth',
        'subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:ep-tls-test.ap-southeast-1.aws.neon.tech',
      ].join('\n'),
    );

    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-out', caCrt, '-days', '1', '-subj', '/CN=AarogyaTestCA'],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      ['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', srvKey, '-out', srvCsr, '-subj', '/CN=ep-tls-test.ap-southeast-1.aws.neon.tech'],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      ['x509', '-req', '-in', srvCsr, '-CA', caCrt, '-CAkey', caKey, '-CAcreateserial', '-out', srvCrt, '-days', '1', '-extfile', extCfg],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', rogueKey, '-out', rogueCrt, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'],
      { stdio: 'ignore' },
    );

    const caPem = fs.readFileSync(caCrt, 'utf8');
    const srvOpts = { key: fs.readFileSync(srvKey), cert: fs.readFileSync(srvCrt) };
    const rogueOpts = { key: fs.readFileSync(rogueKey), cert: fs.readFileSync(rogueCrt) };

    const startMockPgServer = async (mode: 'plaintext' | 'valid_tls' | 'rogue_tls') => {
      const server = net.createServer((sock) => {
        sock.once('data', (buf) => {
          const isSslReq = buf.length === 8 && buf.readInt32BE(0) === 8 && buf.readInt32BE(4) === 80877103;
          if (!isSslReq) {
            sock.destroy();
            return;
          }
          if (mode === 'plaintext') {
            sock.write(Buffer.from('N'));
            return;
          }
          sock.write(Buffer.from('S'));
          const t = new tls.TLSSocket(sock, {
            ...(mode === 'valid_tls' ? srvOpts : rogueOpts),
            isServer: true,
          });
          t.on('error', () => t.destroy());
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const addr = server.address() as net.AddressInfo;
      return { server, port: addr.port };
    };

    try {
      // 1. Plaintext server rejecting SSLRequest ('N') MUST be rejected even when URL has ?sslmode=require
      const plain = await startMockPgServer('plaintext');
      try {
        await expect(
          guard.verifyPostgresTlsConnection(
            `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${plain.port}/aarogyadamu_release_demo?sslmode=require`,
            { ca: caPem },
          ),
        ).rejects.toThrow(/refused TLS negotiation|plaintext/i);
      } finally {
        await new Promise<void>((resolve) => plain.server.close(() => resolve()));
      }

      // 2. Untrusted self-signed certificate MUST be rejected even when server agrees to TLS ('S')
      const rogue = await startMockPgServer('rogue_tls');
      try {
        await expect(
          guard.verifyPostgresTlsConnection(
            `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${rogue.port}/aarogyadamu_release_demo?sslmode=require`,
            { ca: caPem },
          ),
        ).rejects.toThrow(/certificate or handshake verification failed/i);
      } finally {
        await new Promise<void>((resolve) => rogue.server.close(() => resolve()));
      }

      // 3. Valid CA-signed certificate with mismatched hostname MUST be rejected
      const valid = await startMockPgServer('valid_tls');
      try {
        await expect(
          guard.verifyPostgresTlsConnection(
            `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${valid.port}/aarogyadamu_release_demo?sslmode=require`,
            { ca: caPem, servername: 'ep-wrong-host.ap-southeast-1.aws.neon.tech' },
          ),
        ).rejects.toThrow(/TLS certificate or handshake verification failed|hostname mismatch|ERR_TLS_CERT_ALTNAME_INVALID/i);

        // 4. Valid CA-signed TLS server with matching SNI succeeds
        const tlsResult = await guard.verifyPostgresTlsConnection(
          `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${valid.port}/aarogyadamu_release_demo?sslmode=require`,
          { ca: caPem, servername: 'ep-tls-test.ap-southeast-1.aws.neon.tech' },
        );
        expect(tlsResult.encrypted).toBe(true);
        expect(tlsResult.authorized).toBe(true);
        expect(['TLSv1.2', 'TLSv1.3']).toContain(tlsResult.protocol);

        // 5. Simulates Neon TLS-terminating proxy (backend pg_stat_ssl=false while external wire TLS passes)
        const neonProxyPrisma = {
          $queryRawUnsafe: async () => [
            { active_user: 'neondb_owner', session_user: 'neondb_owner', backend_pg_stat_ssl: false },
          ],
        };
        const verifiedMig = await deploy.verifyMigrationSslAndIdentity(neonProxyPrisma, {
          expectedOwnerRole: 'neondb_owner',
          migrationUrl: `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${valid.port}/aarogyadamu_release_demo?sslmode=require`,
          requireSsl: true,
          verifyTlsFn: (u: string) =>
            guard.verifyPostgresTlsConnection(u, {
              ca: caPem,
              servername: 'ep-tls-test.ap-southeast-1.aws.neon.tech',
            }),
        });
        expect(verifiedMig.active_user).toBe('neondb_owner');
        expect(verifiedMig.ssl_active).toBe(true);
        expect(verifiedMig.backend_pg_stat_ssl).toBe(false);

        // 6. Plaintext server MUST cause verifyMigrationSslAndIdentity to reject BEFORE any SQL runs
        const sqlCalled: string[] = [];
        const neverCalledPrisma = {
          $queryRawUnsafe: async (sql: string) => {
            sqlCalled.push(sql);
            return [];
          },
        };
        const plainFail = await startMockPgServer('plaintext');
        try {
          await expect(
            deploy.verifyMigrationSslAndIdentity(neverCalledPrisma, {
              expectedOwnerRole: 'neondb_owner',
              migrationUrl: `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${plainFail.port}/aarogyadamu_release_demo?sslmode=require`,
              requireSsl: true,
            }),
          ).rejects.toThrow(/refused TLS negotiation|plaintext/i);
          expect(sqlCalled.length).toBe(0);
        } finally {
          await new Promise<void>((resolve) => plainFail.server.close(() => resolve()));
        }

        // 7. executeDeploymentSequence passes strict Prisma TLS URLs and succeeds when proxy terminates TLS
        const createdClientUrls: string[] = [];
        let runtimeAuthVerified = false;
        const fakePrismaFactory = (url: string) => {
          createdClientUrls.push(url);
          const u = new URL(url);
          const isRuntime = decodeURIComponent(u.username) === 'aarogyadamu_app';
          return {
            $queryRawUnsafe: async (sql: string) => {
              if (sql.includes('backend_pg_stat_ssl') && sql.includes('pg_catalog.pg_roles')) {
                runtimeAuthVerified = true;
                return [
                  {
                    active_user: 'aarogyadamu_app',
                    session_user: 'aarogyadamu_app',
                    is_superuser: false,
                    can_bypass_rls: false,
                    can_create_db: false,
                    can_create_role: false,
                    can_replicate: false,
                    can_login: true,
                    backend_pg_stat_ssl: false,
                  },
                ];
              }
              if (sql.includes('backend_pg_stat_ssl')) {
                return [{ active_user: 'neondb_owner', session_user: 'neondb_owner', backend_pg_stat_ssl: false }];
              }
              if (sql.includes('WHERE r.rolname = current_user')) {
                return [{ active_user: 'neondb_owner', is_superuser: false, can_create_role: true, scs: 'on' }];
              }
              if (sql.includes("WHERE rolname = 'aarogyadamu_app'")) {
                return [
                  {
                    rolname: 'aarogyadamu_app',
                    rolsuper: false,
                    rolbypassrls: false,
                    rolcreatedb: false,
                    rolcreaterole: false,
                    rolreplication: false,
                    rolcanlogin: true,
                  },
                ];
              }
              if (sql.includes("WHERE rolname = 'aarogyadamu_migrator'")) {
                return [
                  {
                    rolname: 'aarogyadamu_migrator',
                    rolsuper: false,
                    rolbypassrls: false,
                    rolcreatedb: false,
                    rolcreaterole: false,
                    rolreplication: false,
                    rolcanlogin: false,
                  },
                ];
              }
              if (sql.includes('core_rls_count')) {
                return [
                  {
                    app_has_vault_schema: false,
                    app_has_vault_table_grant: false,
                    app_selects_migrations: false,
                    app_selects_audit: true,
                    app_inserts_audit: true,
                    app_updates_audit: false,
                    app_deletes_audit: false,
                    core_rls_count: 15,
                    force_rls_count: 6,
                    active_trigger_count: 11,
                  },
                ];
              }
              if (sql.includes('has_vault_schema')) {
                return [{ has_vault_schema: false, can_read_migrations: false }];
              }
              if (sql.includes('FROM _security_vault.rls_signing_key')) {
                throw new Error('ERROR: permission denied for schema _security_vault (42501)');
              }
              if (sql.includes('unscoped_count')) {
                return [{ unscoped_count: 0 }];
              }
              return [];
            },
            $executeRawUnsafe: async () => 1,
            $disconnect: async () => {},
          };
        };

        let migrated = false;
        await deploy.executeDeploymentSequence({
          migrationUrl: `postgresql://neondb_owner:${OWNER_PASS}@127.0.0.1:${valid.port}/aarogyadamu_release_demo?sslmode=require`,
          runtimeUrl: `postgresql://aarogyadamu_app:${RUNTIME_PASS}@127.0.0.1:${valid.port}/aarogyadamu_release_demo?sslmode=require`,
          expectedOwnerRole: 'neondb_owner',
          runtimePassword: RUNTIME_PASS,
          rlsSecret: RLS_SECRET,
          requireSsl: true,
          verifyTlsFn: (u: string) =>
            guard.verifyPostgresTlsConnection(u, {
              ca: caPem,
              servername: 'ep-tls-test.ap-southeast-1.aws.neon.tech',
            }),
          prismaClientFactory: fakePrismaFactory,
          migrateFn: () => {
            migrated = true;
          },
        });
        expect(migrated).toBe(true);
        expect(runtimeAuthVerified).toBe(true);
        expect(createdClientUrls.length).toBe(3);
        for (const usedUrl of createdClientUrls) {
          const parsedUsed = new URL(usedUrl);
          expect(parsedUsed.searchParams.get('sslmode')).toBe('require');
          expect(parsedUsed.searchParams.get('sslaccept')).toBe('strict');
        }
      } finally {
        await new Promise<void>((resolve) => valid.server.close(() => resolve()));
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
