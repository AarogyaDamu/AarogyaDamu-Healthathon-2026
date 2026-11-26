#!/usr/bin/env node
/**
 * Hosted PostgreSQL (Neon Free + Render Free) security preflight & identity guard.
 *
 * Enforces strict separation between direct owner migrations (`MIGRATION_DATABASE_URL`)
 * and pooled least-privilege runtime (`DATABASE_URL` as `aarogyadamu_app`), validates
 * the target Neon endpoint identity before any SQL runs, and never logs credentials.
 */

const fs = require('node:fs');
const net = require('node:net');
const tls = require('node:tls');

const DEFAULT_DEV_RLS_SECRETS = new Set([
  'aarogya_rls_signing_secret_super_secure_2026_production_key_minimum_32_chars',
  'local-dev-and-test-only-signing-secret-change-for-production',
]);

const FORBIDDEN_HOSTED_DB_NAMES = new Set([
  'aarogyadamu_dev',
  'aarogyadamu_test',
  'aarogyadamu_rls_demo',
]);

const ALLOWED_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);
const DEFAULT_NEON_OWNER_ROLE = 'neondb_owner';
const EXPECTED_RUNTIME_ROLE = 'aarogyadamu_app';
const EXPECTED_MIGRATOR_ROLE = 'aarogyadamu_migrator';

function isHostedMode(env = process.env) {
  return (
    env.NODE_ENV === 'production' &&
    (env.APP_ENV === 'staging' || env.APP_ENV === 'production')
  );
}

function normalizeNeonEndpointHost(rawHostname) {
  if (!rawHostname || typeof rawHostname !== 'string') {
    throw new Error('Neon endpoint hostname is required.');
  }
  const host = rawHostname.trim().toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (
    !host.endsWith('.neon.tech') ||
    labels.length < 4 ||
    labels.some((label) => !/^[a-z0-9-]+$/.test(label))
  ) {
    throw new Error(
      `Database endpoint "${host}" must be a valid *.neon.tech endpoint hostname.`,
    );
  }
  const firstLabel = labels[0];
  const isPooled = firstLabel.endsWith('-pooler');
  const directFirstLabel = isPooled ? firstLabel.slice(0, -'-pooler'.length) : firstLabel;
  if (!directFirstLabel || directFirstLabel.length < 4) {
    throw new Error(`Invalid Neon endpoint prefix in hostname "${host}".`);
  }
  const baseHost = [directFirstLabel, ...labels.slice(1)].join('.');
  const pooledHost = [`${directFirstLabel}-pooler`, ...labels.slice(1)].join('.');
  return {
    rawHost: host,
    baseHost,
    pooledHost,
    isPooled,
    endpointId: directFirstLabel,
  };
}

function validateExpectedNeonEndpoint(rawEndpoint) {
  const trimmed = typeof rawEndpoint === 'string' ? rawEndpoint.trim() : '';
  if (!trimmed) {
    throw new Error(
      'EXPECTED_NEON_ENDPOINT is required in hosted mode (hostname only, e.g. ep-xxxx.ap-southeast-1.aws.neon.tech).',
    );
  }
  if (/[:/?@#\s]/.test(trimmed)) {
    throw new Error(
      'EXPECTED_NEON_ENDPOINT must contain the Neon hostname only without protocol, credentials, port, path, or query parameters.',
    );
  }
  const normalized = normalizeNeonEndpointHost(trimmed);
  if (normalized.isPooled) {
    throw new Error(
      'EXPECTED_NEON_ENDPOINT must be the direct Neon endpoint hostname without "-pooler".',
    );
  }
  return normalized;
}

function parsePostgresUrlStrict(rawUrl, label, { requireSsl = true } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(`${label} is required and cannot be empty.`);
  }
  const trimmed = rawUrl.trim();
  if (trimmed.includes('change-me')) {
    throw new Error(`${label} contains an unconfigured placeholder credential.`);
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} is not a valid PostgreSQL connection URL.`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${label} must use postgresql:// or postgres:// protocol.`);
  }

  if (!parsed.hostname) {
    throw new Error(`${label} must specify a PostgreSQL host.`);
  }

  let username = '';
  let password = '';
  try {
    username = decodeURIComponent(parsed.username || '');
    password = decodeURIComponent(parsed.password || '');
  } catch {
    throw new Error(`${label} contains malformed URL-encoded credentials.`);
  }

  if (!username) {
    throw new Error(`${label} must include a PostgreSQL username.`);
  }
  if (!password) {
    throw new Error(`${label} must include a PostgreSQL password.`);
  }

  const databaseName = parsed.pathname.replace(/^\/+/, '').split('/')[0];
  if (!databaseName) {
    throw new Error(`${label} must specify a target database name.`);
  }
  if (FORBIDDEN_HOSTED_DB_NAMES.has(databaseName.toLowerCase())) {
    throw new Error(
      `Security Error: ${label} targets non-hosted database "${databaseName}".`,
    );
  }

  let sslMode = null;
  let sslAccept = null;
  let sslRootCert = null;
  for (const [k, v] of parsed.searchParams.entries()) {
    const key = k.toLowerCase();
    if (key === 'sslmode') {
      sslMode = String(v).trim().toLowerCase();
    } else if (key === 'sslaccept') {
      sslAccept = String(v).trim().toLowerCase();
    } else if (key === 'sslrootcert') {
      sslRootCert = String(v).trim();
    }
  }
  if (requireSsl && (!sslMode || !ALLOWED_SSL_MODES.has(sslMode))) {
    throw new Error(
      `Security Error: ${label} must enforce TLS with sslmode=require, verify-ca, or verify-full.`,
    );
  }
  if (requireSsl && sslAccept && sslAccept !== 'strict') {
    throw new Error(
      `Security Error: ${label} cannot weaken TLS certificate verification with sslaccept=${sslAccept}.`,
    );
  }

  return {
    rawUrl: trimmed,
    parsed,
    hostname: parsed.hostname.toLowerCase(),
    port: parsed.port || '5432',
    username,
    password,
    databaseName,
    sslMode,
    sslAccept,
    sslRootCert,
  };
}

function validateRuntimePassword(rawPassword) {
  const runtimePassword = typeof rawPassword === 'string' ? rawPassword.trim() : '';
  if (!runtimePassword) {
    throw new Error('APP_RUNTIME_DB_PASSWORD is required in hosted deployments.');
  }
  if (
    runtimePassword.length < 16 ||
    runtimePassword === 'AarogyaAppRuntime2026!' ||
    runtimePassword === 'AarogyaMigrator2026!'
  ) {
    throw new Error(
      'APP_RUNTIME_DB_PASSWORD must be a rotated secret password of at least 16 characters.',
    );
  }
  if (/[\u0000\r\n]/.test(runtimePassword)) {
    throw new Error('APP_RUNTIME_DB_PASSWORD contains invalid control bytes.');
  }
  return runtimePassword;
}

function validateRlsSecret(rawSecret) {
  const rlsSecret = typeof rawSecret === 'string' ? rawSecret.trim() : '';
  if (!rlsSecret || rlsSecret.length < 32 || DEFAULT_DEV_RLS_SECRETS.has(rlsSecret)) {
    throw new Error(
      'RLS_CONTEXT_SECRET must be a distinct >= 32 character cryptographic secret in staging/production.',
    );
  }
  return rlsSecret;
}

function getExpectedOwnerRole(env = process.env) {
  const configured = typeof env.EXPECTED_NEON_OWNER_ROLE === 'string'
    ? env.EXPECTED_NEON_OWNER_ROLE.trim()
    : '';
  const ownerRole = configured || DEFAULT_NEON_OWNER_ROLE;
  if (ownerRole === EXPECTED_RUNTIME_ROLE || ownerRole === EXPECTED_MIGRATOR_ROLE) {
    throw new Error(
      `EXPECTED_NEON_OWNER_ROLE cannot be "${ownerRole}"; specify the Neon project owner role.`,
    );
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ownerRole)) {
    throw new Error('EXPECTED_NEON_OWNER_ROLE contains invalid PostgreSQL role characters.');
  }
  return ownerRole;
}

function validateHostedMigrationOnly(env = process.env) {
  if (!isHostedMode(env)) {
    throw new Error(
      'Hosted validation called outside hosted mode (requires NODE_ENV=production and APP_ENV=staging|production).',
    );
  }

  const rawMigrationUrl = typeof env.MIGRATION_DATABASE_URL === 'string'
    ? env.MIGRATION_DATABASE_URL.trim()
    : '';
  if (!rawMigrationUrl) {
    throw new Error(
      'MIGRATION_DATABASE_URL is strictly required in hosted mode (ADMIN_DATABASE_URL and DATABASE_URL fallbacks are disabled).',
    );
  }

  const expectedEndpoint = validateExpectedNeonEndpoint(env.EXPECTED_NEON_ENDPOINT);
  const expectedOwnerRole = getExpectedOwnerRole(env);
  const migration = parsePostgresUrlStrict(rawMigrationUrl, 'MIGRATION_DATABASE_URL', {
    requireSsl: true,
  });
  const migrationEndpoint = normalizeNeonEndpointHost(migration.hostname);

  if (migrationEndpoint.isPooled) {
    throw new Error(
      'MIGRATION_DATABASE_URL must use the direct Neon endpoint (not "-pooler") for DDL migrations and role provisioning.',
    );
  }
  if (migrationEndpoint.baseHost !== expectedEndpoint.baseHost) {
    throw new Error(
      `Security Error: MIGRATION_DATABASE_URL endpoint "${migrationEndpoint.rawHost}" does not match EXPECTED_NEON_ENDPOINT "${expectedEndpoint.baseHost}".`,
    );
  }
  if (migration.username !== expectedOwnerRole) {
    throw new Error(
      `Security Error: MIGRATION_DATABASE_URL must connect as configured Neon owner "${expectedOwnerRole}", got "${migration.username}".`,
    );
  }
  if (migration.username === EXPECTED_RUNTIME_ROLE) {
    throw new Error(
      'Security Error: MIGRATION_DATABASE_URL cannot use restricted runtime role aarogyadamu_app.',
    );
  }

  return {
    expectedEndpoint,
    expectedOwnerRole,
    migration,
    migrationUrl: migration.rawUrl,
  };
}

function validateHostedDatabaseConfig(env = process.env) {
  const { expectedEndpoint, expectedOwnerRole, migration, migrationUrl } =
    validateHostedMigrationOnly(env);

  const rawRuntimeUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
  if (!rawRuntimeUrl) {
    throw new Error(
      'DATABASE_URL is required in hosted deployments and must use the pooled aarogyadamu_app connection.',
    );
  }
  if (rawRuntimeUrl === migrationUrl) {
    throw new Error(
      'Security Error: DATABASE_URL cannot be identical to MIGRATION_DATABASE_URL.',
    );
  }

  const runtime = parsePostgresUrlStrict(rawRuntimeUrl, 'DATABASE_URL', { requireSsl: true });
  const runtimeEndpoint = normalizeNeonEndpointHost(runtime.hostname);

  if (!runtimeEndpoint.isPooled) {
    throw new Error(
      'DATABASE_URL must use the Neon pooled endpoint ("-pooler") for application runtime traffic.',
    );
  }
  if (runtimeEndpoint.baseHost !== expectedEndpoint.baseHost) {
    throw new Error(
      `Security Error: DATABASE_URL endpoint "${runtimeEndpoint.rawHost}" does not match EXPECTED_NEON_ENDPOINT "${expectedEndpoint.baseHost}".`,
    );
  }
  if (runtime.username !== EXPECTED_RUNTIME_ROLE) {
    throw new Error(
      `Security Error: DATABASE_URL must connect as "${EXPECTED_RUNTIME_ROLE}", got "${runtime.username}".`,
    );
  }
  if (runtime.databaseName !== migration.databaseName) {
    throw new Error(
      `Security Error: DATABASE_URL database "${runtime.databaseName}" does not match MIGRATION_DATABASE_URL database "${migration.databaseName}".`,
    );
  }

  const runtimePassword = validateRuntimePassword(env.APP_RUNTIME_DB_PASSWORD);
  if (runtime.password !== runtimePassword) {
    throw new Error(
      'Security Error: DATABASE_URL password does not match APP_RUNTIME_DB_PASSWORD.',
    );
  }

  const rlsSecret = validateRlsSecret(env.RLS_CONTEXT_SECRET);

  return {
    expectedEndpoint,
    expectedOwnerRole,
    migration,
    runtime,
    migrationUrl,
    runtimeUrl: runtime.rawUrl,
    runtimePassword,
    rlsSecret,
  };
}

function buildPrismaStrictTlsUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const existingMode = parsed.searchParams.get('sslmode')?.trim().toLowerCase();
  if (existingMode && !ALLOWED_SSL_MODES.has(existingMode)) {
    throw new Error(
      `Security Error: Cannot construct strict TLS URL from unsafe sslmode="${existingMode}".`,
    );
  }
  const existingAccept = parsed.searchParams.get('sslaccept')?.trim().toLowerCase();
  if (existingAccept && existingAccept !== 'strict') {
    throw new Error(
      `Security Error: Cannot construct strict TLS URL from unsafe sslaccept="${existingAccept}".`,
    );
  }
  // Prisma 5 query/schema engine treats sslmode=verify-full/verify-ca as prefer and
  // defaults sslmode=require to accept_invalid_certs unless sslaccept=strict is explicit.
  parsed.searchParams.set('sslmode', 'require');
  parsed.searchParams.set('sslaccept', 'strict');
  return parsed.toString();
}

function verifyPostgresTlsConnection(rawUrl, options = {}) {
  const parsed = parsePostgresUrlStrict(rawUrl, options.label || 'PostgreSQL TLS connection', {
    requireSsl: true,
  });
  const port = Number(parsed.port || '5432');
  const hostname = parsed.hostname;
  const verifyHost = (options.servername || hostname).trim().toLowerCase();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 10000;

  let ca = options.ca;
  if (!ca && parsed.sslRootCert) {
    try {
      ca = fs.readFileSync(parsed.sslRootCert, 'utf8');
    } catch {
      return Promise.reject(
        new Error(
          `Security Error: Unable to read configured sslrootcert for ${hostname}:${port}.`,
        ),
      );
    }
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let rawSocket = null;
    let tlsSocket = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (tlsSocket) {
        tlsSocket.removeAllListeners();
        tlsSocket.destroy();
      }
      if (rawSocket) {
        rawSocket.removeAllListeners();
        rawSocket.destroy();
      }
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const succeed = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      fail(new Error(`Security Error: TLS handshake timed out for ${hostname}:${port}.`));
    }, timeoutMs);

    rawSocket = net.createConnection({ host: hostname, port });
    rawSocket.once('error', (err) => {
      fail(
        new Error(
          `Security Error: Unable to open TCP connection for TLS verification to ${hostname}:${port} (${err.code || err.message}).`,
        ),
      );
    });

    rawSocket.once('connect', () => {
      // PostgreSQL v3 SSLRequest packet: Int32(8), Int32(80877103)
      const sslRequest = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);
      rawSocket.write(sslRequest);
    });

    rawSocket.once('close', () => {
      if (!settled && !tlsSocket) {
        fail(
          new Error(
            `Security Error: PostgreSQL server at ${hostname}:${port} closed connection before TLS negotiation.`,
          ),
        );
      }
    });

    rawSocket.once('data', (chunk) => {
      if (!chunk || chunk.length < 1 || chunk[0] !== 0x53) {
        const reply = chunk && chunk.length > 0 ? String.fromCharCode(chunk[0]) : 'EOF';
        fail(
          new Error(
            `Security Error: PostgreSQL server at ${hostname}:${port} refused TLS negotiation (received '${reply}'; plaintext connections are forbidden).`,
          ),
        );
        return;
      }

      rawSocket.removeAllListeners();
      const tlsOptions = {
        socket: rawSocket,
        host: verifyHost,
        servername: net.isIP(verifyHost) ? undefined : verifyHost,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        checkServerIdentity: (_host, cert) => tls.checkServerIdentity(verifyHost, cert),
      };
      if (ca) {
        tlsOptions.ca = ca;
      }

      tlsSocket = tls.connect(tlsOptions);
      tlsSocket.once('error', (err) => {
        fail(
          new Error(
            `Security Error: TLS certificate or handshake verification failed for ${hostname}:${port} (${err.code || err.message}).`,
          ),
        );
      });
      tlsSocket.once('secureConnect', () => {
        if (!tlsSocket.encrypted || !tlsSocket.authorized) {
          fail(
            new Error(
              `Security Error: TLS socket is not authenticated for ${hostname}:${port} (${tlsSocket.authorizationError || 'unauthorized'}).`,
            ),
          );
          return;
        }
        const protocol = tlsSocket.getProtocol();
        if (protocol !== 'TLSv1.2' && protocol !== 'TLSv1.3') {
          fail(
            new Error(
              `Security Error: Weak or unsupported TLS protocol "${protocol || 'unknown'}" negotiated for ${hostname}:${port}.`,
            ),
          );
          return;
        }
        const peerCert = tlsSocket.getPeerCertificate();
        if (!peerCert || Object.keys(peerCert).length === 0) {
          fail(
            new Error(
              `Security Error: No peer X.509 certificate received from ${hostname}:${port}.`,
            ),
          );
          return;
        }
        const identityErr = tls.checkServerIdentity(verifyHost, peerCert);
        if (identityErr) {
          fail(
            new Error(
              `Security Error: TLS certificate hostname mismatch for ${hostname}:${port} (${identityErr.code || identityErr.message}).`,
            ),
          );
          return;
        }
        const cipher = tlsSocket.getCipher();
        succeed({
          encrypted: true,
          authorized: true,
          protocol,
          cipher: cipher ? cipher.name : null,
          hostname: verifyHost,
          port,
          peerSubjectCN: peerCert.subject ? peerCert.subject.CN || null : null,
        });
      });
    });
  });
}

function escapeSqlStringLiteral(value) {
  if (typeof value !== 'string' || /[\u0000]/.test(value)) {
    throw new Error('SQL string literal contains invalid characters.');
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function buildRuntimeUrlWithPassword(rawRuntimeUrl, password) {
  const parsed = new URL(rawRuntimeUrl);
  parsed.username = EXPECTED_RUNTIME_ROLE;
  parsed.password = password;
  return parsed.toString();
}

function sanitizeConnectionSummary(parsedUrl) {
  if (!parsedUrl) return 'unknown';
  const db = parsedUrl.pathname ? parsedUrl.pathname.replace(/^\/+/, '') : 'unknown';
  const user = parsedUrl.username ? decodeURIComponent(parsedUrl.username) : 'unknown';
  return `host=${parsedUrl.hostname}, db=${db}, user=${user}, sslmode=${parsedUrl.sslMode || parsedUrl.searchParams?.get('sslmode') || 'unset'}`;
}

module.exports = {
  DEFAULT_DEV_RLS_SECRETS,
  DEFAULT_NEON_OWNER_ROLE,
  EXPECTED_RUNTIME_ROLE,
  EXPECTED_MIGRATOR_ROLE,
  ALLOWED_SSL_MODES,
  isHostedMode,
  normalizeNeonEndpointHost,
  validateExpectedNeonEndpoint,
  parsePostgresUrlStrict,
  validateRuntimePassword,
  validateRlsSecret,
  getExpectedOwnerRole,
  validateHostedMigrationOnly,
  validateHostedDatabaseConfig,
  escapeSqlStringLiteral,
  buildRuntimeUrlWithPassword,
  buildPrismaStrictTlsUrl,
  verifyPostgresTlsConnection,
  sanitizeConnectionSummary,
};
