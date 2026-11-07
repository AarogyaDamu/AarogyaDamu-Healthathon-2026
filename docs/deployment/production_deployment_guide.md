# Production Deployment Guide

## Current supported deployment boundary

The repository now targets PostgreSQL through Prisma and includes a PostgreSQL baseline migration. The database migration and API behavior are locally validated against disposable PostgreSQL, but no hosted staging/production infrastructure is provisioned or verified by this repository. Do not point staging/mobile at a development or audit database.

There is no verified hosting provider, Docker image, production database, EAS project, signing credential, push sender, or monitoring service in this repository. This document describes the controlled deployment sequence and required gates; it does not assert those services exist.

## Architecture

```text
Expo Android app ──HTTPS──┐
Doctor Vite SPA ───HTTPS──┼── Express API ── Prisma database
                         │              ├── private file storage
                         │              ├── email provider
                         │              ├── Damu voice provider (Groq, optional until enabled)
                         │              ├── OCR provider (Google Vision + private object storage)
                         └──────────────┴── push provider (not configured)
```

Create separate development, staging, and production projects, databases, secrets, storage buckets, API origins, and provider credentials. Keep patient data and credentials out of build artifacts and browser/mobile public variables. `EXPO_PUBLIC_*` and `VITE_*` values are public client configuration, never secrets. Web/mobile requests carry an environment label and the API returns `409 ENVIRONMENT_MISMATCH` when that label differs from `APP_ENV`; this safety check does not replace infrastructure isolation.

## Environment configuration

### API (server-side secrets only)

Set `NODE_ENV=production` and `APP_ENV=staging` or `production`. Provision distinct, randomly generated `JWT_SECRET`, `DOCTOR_INVITATION_SECRET`, and `DOCTOR_INVITATION_ADMIN_KEY`; verified `WEB_APP_URL`, `API_PUBLIC_URL`, exact HTTPS `ALLOWED_ORIGINS`; environment-specific PostgreSQL `DATABASE_URL`; email credentials; rate-limit Redis settings for multi-instance deployment; private storage configuration; Google Vision/storage credentials for report OCR; and only the AI provider keys approved for the environment.

Never put API secrets in `VITE_*`, `EXPO_PUBLIC_*`, source code, checked-in `.env` files, or logs. Disable demo authentication and never seed demonstration accounts in staging/production. Local templates are examples, not deployable secrets.

### Web

Set `VITE_APP_ENV=staging|production` and `VITE_API_URL=https://<environment-api>/api` at build time. The web client rejects production builds with missing environment/API configuration, insecure URLs, or loopback origins. Configure the selected SPA host to serve `index.html` for nested application routes and verify a hard refresh on a protected route; no host is selected or validated by this repository.

### Android/EAS

The repository's `eas.json` contains development, internal staging, and production AAB profiles. The EAS project is not initialized yet; an authorized project owner must run `eas init` and configure account access. Configure `EXPO_PUBLIC_APP_ENV` through the selected profile and set `EXPO_PUBLIC_API_URL` in that EAS environment. Staging/production must point only to its own HTTPS API. Confirm the Expo project/account, Android application ID, version/build number, signing credentials, icons/splash assets, permissions, deep links, privacy disclosures, and store/internal distribution access before building. Signing keys remain in EAS/secret storage, never Git.

## Database and migration procedure

1. Provision an isolated managed PostgreSQL database and review the baseline migration `20261105000000_baseline_current_schema`; verify relational semantics, indexes, transactions, connections, and backup/PITR behavior on disposable databases.
2. Back up the target database using the provider's documented consistent snapshot/PITR mechanism. Verify backup identity, timestamp, encryption/access policy, and artifact/provider state.
3. Deploy the reviewed application version to a staging database snapshot. Run `npm run db:status`, then `npm run db:deploy` using staging-only credentials. Never use `npm run db:migrate`, `prisma db push`, `migrate reset`, or seed against a shared/staging/production database.
4. Verify migration completion, schema compatibility, API readiness, and synthetic acceptance workflows. A failed migration blocks rollout. Preserve logs and provider migration metadata.
5. Repeat with an approved production backup and change window only after qualified approval and successful staging restore/drill.
6. On failure, stop rollout; preserve the failed migration and logs. Prefer a reviewed forward-fix. Restore only from a verified provider backup with data-owner approval and a documented recovery decision; do not edit applied migration files or reset the database.

Current local commands:

```powershell
npm ci
npm run db:generate
npm run db:status
npm run db:deploy
```

`db:deploy` is the production-style Prisma migration command. A successful local migration does not prove that a hosted production database, backup policy, or operational controls exist.

## Backend deployment

After the hosted PostgreSQL target and operational controls are independently validated:

1. Build with the repository's pinned Node/npm toolchain and lockfile.
2. Inject API secrets through the platform's secret manager.
3. Run migrations as a single controlled release job, not on every API replica.
4. Start the API only after migrations and database checks succeed.
5. Expose `/health/live` for process liveness and `/health/ready` for database readiness. Responses intentionally omit connection details and credentials.
6. Configure bounded graceful shutdown, TLS termination, request/body limits, exact CORS origins, trusted proxy hops, distributed rate limiting, and capacity-appropriate database pooling.
7. Configure the agent-expiry worker only where intended; its readiness is not currently exposed as a separate health check.

Production startup deliberately fails for missing explicit environment configuration, non-PostgreSQL URLs, demo authentication, placeholder/local URLs, and incomplete provider settings. Do not bypass these guards.

## Web deployment

Run the production build with environment-specific Vite values. Publish the generated `apps/web/dist` directory through an HTTPS static host. Configure SPA fallback and security/cache headers at that host. Verify login/logout, protected routes, assigned-patient access, error states, refresh-token flow, and nested-route refresh in the deployed staging environment.

## Android build and distribution

After staging API and EAS configuration are available:

```powershell
npx eas-cli build --profile staging --platform android
npx eas-cli build --profile production --platform android
```

Use the staging/internal profile first. Verify build ID, version/build number, signing owner, API endpoint, permissions, deep links, offline behavior, WebView Three.js fallback, and patient/caregiver workflows on actual Android hardware. Distribute only to approved internal testers. The production AAB command does not authorize Play Store submission; no public submission is authorized by this guide.

## Provider and file-storage configuration

- **Email:** configure and verify the sender/domain and password-reset delivery; test delivery without logging tokens.
- **Damu:** text requests use the deterministic, approved knowledge-base and patient-record retrieval path. Audio requests require server-side `GROQ_API_KEY`; if it is absent, the API returns an explicit provider-unavailable error and never silently substitutes mock audio.
- **OCR:** report uploads require private object storage and Google Vision credentials/ADC. Missing configuration must remain an explicit extraction failure; the client must not synthesize report text.
- **Push:** no real push provider is configured. Token registration alone does not dispatch a notification. Do not claim provider-accepted, device-delivered, or read status.
- **Files:** current storage is private local filesystem storage. Before multi-instance/production use, move to private durable storage with scoped access, encryption, upload type/size policy, audit, retention, backup, and restore validation.

## Monitoring, backup, and recovery

Structured sanitized API logs are emitted to process output. Route platform logs to a restricted operational sink; configure alerting for API/readiness failures, request errors/latency, database, worker, email, AI/transcription, push, file storage, and mobile/web crashes. No dashboard or paging integration is configured here.

Set database backup frequency/retention/encryption/access with the selected provider and data owner. Run a restore drill into an isolated non-production database and verify integrity, migrations, representative synthetic records, and application access before claiming recoverability. Back up private files and critical configuration separately. Preserve deployment identifiers and migration logs.

For database unavailability, failed migrations, provider outages, bad web/mobile releases, or file-storage outages: fail safely, suspend affected workflow, preserve sanitized incident identifiers, notify the owner, use manual clinical processes where approved, and recover/roll forward under the incident owner. Do not automatically replay clinical actions or delete/restore production records without authorization.

## Release, rollback, and privacy gates

See [`production_release_checklist.md`](./production_release_checklist.md). Rollback must be compatible with the expanded schema; destructive schema rollback is not assumed safe. Use reviewed forward migrations or a data-owner-approved verified restore. Obtain qualified clinical/legal review of privacy notice, consent, data-retention/account deletion, caregiver sharing, AI/provider disclosure, and applicable Indian requirements; no legal compliance or certification is claimed.
