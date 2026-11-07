# Phase 8 â€” Pilot Readiness and Production Preparation

**Assessment date:** 2026-11-04  
**Decision:** **NOT READY** for a controlled real-patient pilot. A local, synthetic-data demonstration is feasible subject to the limitations below.

## Executive summary

The repository is an npm-workspaces monorepo containing an Express/Prisma API, a React/Vite doctor workstation, an Expo patient/caregiver application, and shared contracts. Existing Phase 1â€“7 features and a substantial automated test suite are present. This assessment preserves pre-existing, uncommitted changes in the worktree.

The project is not presently deployable to a real staging or production service: the Prisma schema is SQLite-only, the API does not have a production database migration path for a hosted database, and no real staging or production infrastructure is configured. Android signing/build credentials, a device test, real Damu provider checks, external push delivery, production object storage, monitoring alerts, and a production backup/restore drill were not available or verified. These are release blockers, not assumptions.

## Repository and implementation map

| Area | Observed implementation | Readiness |
|---|---|---|
| Monorepo | npm workspaces: `apps/*`, `services/*`, `packages/*`; npm lockfile | Implemented |
| Backend | Express API, Prisma client, validation/authentication/role and consent paths, audit logger, opt-in agent-expiry worker | Partial; no production deployment/runtime evidence |
| Database | 25 ordered Prisma migrations; schema datasource is SQLite; development DB and ignored backup files exist | Local migration chain verified on a disposable DB; production database blocked |
| Patient/caregiver | Expo SDK 53 / React Native 0.79 app, Expo Router, secure-store, notification and WebView packages; application ID configured | Android release/device testing not performed |
| Doctor workstation | React 18/Vite app and API client; production-build command exists | Build/test can be run locally; no hosted route/refresh validation |
| Damu | Read-only patient-context tools and rule-based text intent handling; Groq voice provider selected only with `GROQ_API_KEY`; a mock provider is the development fallback | Actual provider not verified; mock is not production evidence |
| Three.js | Web scene and Android WebView scene; native HTML fetches Three.js from a public CDN and has a fallback | Bundle verified for Expo web only; no real browser/device rendering test |
| Notifications | Durable in-app records, quiet-hour scheduling, deduplication, token registration | No external push dispatch implementation/provider evidence |
| Files | Multer memory upload and private local filesystem storage under `STORAGE_DIR` | Single-instance/local only; no production object store/retention/backup integration |
| CI/CD | GitHub Actions validation workflow added; no deployment job | Workflow not run by GitHub; no environment credentials or deploy target |
| Deployment | No Docker, hosting, database service, monitoring vendor, or deployment target detected | Not configured |

## Changes made for readiness

- Added `/health/live` and `/health/ready`; readiness checks the database and returns only a generic safe status. `/health` remains compatible.
- Production API startup now connects to the database before listening, logs a non-sensitive startup failure, and closes the HTTP server and Prisma client on `SIGTERM`/`SIGINT`.
- Added `APP_ENV` validation. Staging and production API startup are refused while the Prisma datasource remains SQLite-only. Production also rejects demo authentication, placeholder/local URLs, insecure origins, and missing environment-specific database configuration.
- Staging/production web builds require a named environment and a configured credential-free HTTPS API URL. Mobile release API configuration similarly refuses missing or unsuitable staging/production endpoints rather than silently targeting Android emulator loopback.
- Web and mobile API clients now send an environment label; the API rejects a mismatched client/API environment with HTTP 409. This is an additional misconfiguration guard, not a substitute for separate databases, endpoints, or correctly managed build variables.
- Added EAS development, internal staging, and app-bundle production profiles. The staging/production API URL still has to be provided through the corresponding EAS environment; no EAS project or build is claimed.
- Added migration status and production-deploy scripts (`npm run db:status`, `npm run db:deploy`); `db:migrate` remains a development-only migration authoring command.
- Synthetic seed execution now rejects non-development environments and non-local SQLite URLs.
- Corrected Damu safety and response-contract defects found during readiness testing: current spoken/numeric glucose is checked before stored readings, medication dose changes are refused, text-only requests no longer expose a transcript, mock transcription is labeled accurately, and HbA1c knowledge search handles punctuation. Added regression coverage and scoped P6 test cleanup to its own fixtures.
- Corrected a notification status defect: registered device tokens were previously treated as proof of push dispatch even though no provider was called. In-app status remains accurate and an operational warning is emitted instead.
- Added a mobile Babel transform required to bundle the existing Three.js static class blocks. Expo web export then completed successfully.
- Added a CI workflow for dependency installation, disposable SQLite migration deployment, type/build checks, and existing tests. The workflow is not evidence that a remote CI run succeeded.

## Environment and deployment model

Local development uses the repository's existing `.env` convention and local SQLite. The environment templates now name `APP_ENV=development`; the mobile app should use a reachable LAN address on a physical Android device (the existing `.env.example` uses localhost for local development/emulators).

EAS defines separate development, staging, and production profiles. Set `EXPO_PUBLIC_API_URL` in the relevant EAS environment to a reachable endpoint; staging and production builds are rejected at runtime if their endpoint is absent, contains credentials, is not HTTPS, or points to a loopback host. Vite deployments similarly need `VITE_APP_ENV`, `VITE_API_URL`, and a hosting-specific SPA fallback.

Staging and production cannot be enabled by configuration alone. The Prisma schema uses SQLite, API startup deliberately blocks non-development environments, and there is no isolated hosted database, API, web deployment, secrets manager, or provider setup to validate. No production deployment was attempted.

## Backend and database evidence

The API exposes liveness separately from database readiness. The opt-in worker is not covered by a health/readiness probe. Production runtime startup and graceful-shutdown logic are implemented but have not been exercised against a deployed process.

`npm run db:deploy` uses `prisma migrate deploy`; `npm run db:status` reports migration status. **Observed:** `npm --workspace=services/api run prisma:deploy` successfully applied all 25 migrations in order to a newly created disposable SQLite database. This did not touch the repository's development database and does not prove a production-engine migration.

The migration workflow never uses `db push` or reset for deployment. No production backup artifact was created. A disposable SQLite backup/restore mechanics check passed (details below); existing development backup files are not treated as production backup evidence.

## Application, provider, and workflow verification

- **Android:** Package ID is `in.panumirge.aarogyadamu`; version is `1.0.0` and microphone permission is declared. App icon/splash and Android `versionCode` are not configured. EAS profiles are prepared. No AAB/APK was generated; no Android device/emulator acceptance, login, deep-link, offline, push, or account-switch test is claimed.
- **Doctor web:** The application uses a configurable API URL and now rejects unconfigured production builds. Unit tests and a production build are locally executable. A real hosted nested-route refresh test was not performed because no host is configured.
- **Patient/caregiver:** Existing route and API tests cover portions of patient, caregiver, appointments, medication, tasks, Damu, and journey flows. They are not a cross-platform acceptance test against a deployed staging instance with provisioned synthetic accounts.
- **Damu:** Patient-context and read-only tool implementations exist. The Groq voice provider requires `GROQ_API_KEY`; without it, development falls back to a mock provider. No credential was supplied and no external provider request/model/latency was verified. Local rule-based responses are not represented as a live LLM integration.

- **Notifications:** Database/in-app events and push-token enrollment exist. No actual Expo/APNs/FCM delivery provider is implemented or verified. A token registration does not establish device delivery.
- **Storage:** Reports use private local filesystem storage and in-memory upload buffering. Multi-instance durable storage, tested retention, and object-store access controls remain unconfigured.
- **Observability/privacy/governance:** Structured sanitized application logs and existing governance documentation are present. There is no external error dashboard/alert pipeline; privacy/retention statements require implementation-level review and qualified legal/clinical approval. No compliance certification is claimed.

## End-to-end acceptance

The requested full journey across patient, caregiver, doctor, Damu, notifications and Three.js cannot be independently accepted without a deployed staging API/database, real providers, a configured Android device, and provisioned synthetic accounts. Existing automated tests provide partial regression evidence only. No real-patient data was created or used.

## Production readiness matrix

Statuses are evidence-based: **PASS** independently verified; **PARTIAL** implemented but incompletely verified; **BLOCKED** missing prerequisite; **FAIL** observed defect; **NOT APPLICABLE** not required.

| Category | Status | Evidence / remaining gate |
|---|---|---|
| Backend startup and health checks | PARTIAL | Liveness/readiness implemented; production startup is intentionally blocked on SQLite; deployed process/provider checks unavailable |
| Database migrations | PARTIAL | All 25 migrations deploy on disposable SQLite; hosted production engine/history absent |
| Backup and recovery | PARTIAL | Disposable migrated SQLite backup and restored copy passed integrity, foreign-key, and synthetic-record checks; no production backup service or artifact |
| Mobile release build | BLOCKED | EAS profile exists but no EAS project is configured; no signing credentials, AAB/APK, or build identifier; app icon/splash and Android versionCode are not configured |
| Android device testing | BLOCKED | No real/reliable Android device acceptance evidence |
| Doctor web build/tests | PARTIAL | Local checks possible; no hosted platform or nested-route refresh evidence |
| Authentication | PARTIAL | Automated role/session tests exist; no deployed patient/doctor/caregiver accounts tested |
| Prescriptions | PARTIAL | Workflow and regression coverage exist; no cross-workspace deployed acceptance |
| Tasks | PARTIAL | Assignment/completion coverage exists; no deployed actor-attribution acceptance |
| Appointments | PARTIAL | Booking/status coverage exists; no deployed lifecycle or push reminder check |
| Damu AI | BLOCKED | No configured/verified real provider; a mock fallback exists only for development |
| Three.js | PARTIAL | Expo web bundle succeeds; real browser, Android WebView/CDN-offline, and lifecycle tests absent |
| Notifications | BLOCKED | In-app notifications exist; no external push sender or device-delivery evidence |
| Caregiver access | PARTIAL | Permission/revocation tests exist; deployed revocation and shared-device cleanup not exercised |
| Monitoring | PARTIAL | Structured local logs; no alerting/error-monitoring deployment |
| Privacy and governance | PARTIAL | Documentation exists; accurate implementation mapping and qualified review outstanding |
| File storage | BLOCKED | Local filesystem only; durable private production storage and recovery absent |
| Pilot operations | PARTIAL | Operator procedures documented; no live environment/support roster |
| CI/CD | PARTIAL | Workflow authored, not remotely executed; no deployment/release artifact evidence |

## Known blockers and next gates

1. Select and provision isolated staging/production infrastructure and migrate the database architecture from SQLite using a reviewed, additive migration plan.
2. Supply environment secrets and verified HTTPS origins; run production configuration validation without exposing values.
3. Configure and exercise email, Damu voice (if enabled), push, private report storage, monitoring, and database backup providers.
4. Run CI remotely; generate and internally distribute a signed Android AAB/APK; execute the Android and web route acceptance matrix.
5. Execute the full synthetic-data three-role journey on staging; independently verify restore and incident procedures.
6. Obtain qualified clinical/legal review of consent, privacy, retention, AI disclosures, and pilot governance before inviting real patients.
7. Review dependency advisories reported during installation (35 total: 1 low, 30 moderate, 4 high) as part of the planned comprehensive security review; no broad audit or automatic dependency remediation was performed in Phase 8.

No separate repository-wide security audit was undertaken as part of this phase.

## Verification log

Commands and results observed during this work:

- `npm --workspace=services/api run prisma:deploy` with a disposable `DATABASE_URL`: **PASS**, all 25 SQLite migrations applied.
- `npm run db:status`: **BLOCKED/exit 1 for the existing development database**; Prisma reports four unapplied migrations (P4â€“P7). No migration was applied to that existing database.
- Disposable backup drill: `npm --workspace=services/api run prisma:deploy` against `file:./p8-backup-<unique-id>.db`, then Python's standard-library `sqlite3.Connection.backup` to a separate backup file and a second restored file. `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and the synthetic user record were verified on both copies: **PASS**. The temporary artifacts were removed afterward. This is not a production backup service or production restore drill.
- Seed protection: `APP_ENV=staging npm --workspace=services/api run prisma:seed` (PowerShell environment equivalent): **PASS**, rejected before database access.
- Production configuration guard: `NODE_ENV=production APP_ENV=production` with otherwise valid-shaped dummy configuration and SQLite `DATABASE_URL`: **PASS**, startup configuration rejected the SQLite-only datasource. No credentials were used.
- `npm --workspace=services/api run test -- --runTestsByPath src/__tests__/health.test.ts`: **PASS**, 3/3 tests (health liveness, DB readiness, and no false push-delivery status).
- `npm --workspace=apps/web run test`: **PASS**, 42/42 tests.
- `npm --workspace=apps/mobile run test`: **PASS**, 45/45 tests.
- `npm run test:api`: **PASS**, API Jest 34/34 suites and 717/717 tests passed; the Vitest API integration suite also passed 2/2 tests. The run includes regressions for newly reported severe glucose readings in mg/dL, mmol/L, and spoken-number forms while the stored reading is normal.
- `npm run typecheck` with `VITE_APP_ENV=staging` and a placeholder HTTPS `VITE_API_URL`: **PASS**, mobile TypeScript check, API TypeScript build, and web TypeScript/Vite production build all completed. Vite emitted upstream deprecation/plugin warnings.
- `npm --workspace=services/api exec -- prisma validate`: **PASS**, schema valid.
- `npx expo export --platform web`: **PASS** after adding the required Babel transform; the web bundle completed with 2,799 modules. Expo route types were regenerated by starting Expo and confirmed to include the notifications route.
- `npx expo install --check`: **PASS** after aligning Expo native packages to SDK 53 compatible versions.
- `eas config --platform android --profile staging --json`: **BLOCKED**, EAS reports that the project is not configured and requires owner-authorized `eas init`. No cloud build was started.
- The Expo server responded HTTP 200 on port 8099 during validation and was stopped. No AAB/APK, Android device test, external-provider test, or hosted deployment was performed. `adb` and `sqlite3` executables were not present; Python's SQLite module was used for the disposable backup drill. The local Node version was 20.20.2; Vitest 5 declares a Node >=22.12 engine requirement, and the integration suite was not reached.
- `npm --workspace=apps/mobile run ...` native build, Android device test, external-provider delivery test, hosted deployment, and production backup remain **NOT RUN**.


