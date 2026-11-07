# Production Release Checklist

Use one copy for each release and record the owner, date, environment, build/commit identifier, and evidence links. **Any unmet BLOCKER stops release.** This checklist does not authorize production deployment or public store submission.

## Staging gate

- [ ] Named release owner and clinical approver; pilot scope and support/escalation roster approved.
- [ ] Isolated staging API, database, web origin, file storage, and provider accounts provisioned; verified not shared with development or production.
- [ ] PostgreSQL Prisma datasource and reviewed baseline migration `20261105000000_baseline_current_schema` are applied to the isolated staging target; hosted staging evidence is recorded.
- [ ] Environment secrets injected from secret manager; distinct auth/invitation secrets; no demo auth or seed data; exact HTTPS CORS/API/web URLs.
- [ ] `npm ci`; lockfile valid; CI workflow run recorded; API, web, mobile tests and production builds recorded.
- [ ] `npm run db:status` reviewed; `npm run db:deploy` applied only to the intended staging target; schema and migration logs retained.
- [ ] Backup artifact and restore drill verified in non-production; integrity, synthetic records, encryption/access controls, and recovery owner recorded.
- [ ] API `/health/live` and `/health/ready`, startup failure, graceful shutdown, database connectivity, and worker supervision verified.
- [ ] Damu text grounding and refusal behavior are tested; Groq audio is configured and live-tested if voice is enabled. Missing provider configuration fails explicitly; mock responses do not count.
- [ ] Google Vision/private storage OCR is configured and live-tested with a synthetic report; extraction failure is explicit and no fabricated text path exists.
- [ ] Doctor web HTTPS build works; nested protected route refresh and logout tested on the actual host.
- [ ] Android internal AAB/APK built with signed artifact, ID/version/build number and build ID recorded; endpoint is staging HTTPS; credentials remain outside Git.
- [ ] Android app icon, splash screen, package ID, versionCode, microphone/notification permissions, and deep links are set and verified on-device.
- [ ] Test patient, doctor, and caregiver accounts contain synthetic data only. Role isolation, prescriptions, tasks, appointment lifecycle, note approval/sharing, consent, revocation, and actor attribution pass across all workspaces.
- [ ] Notification state accurately distinguishes created/queued/provider-accepted/device-delivered/read. Actual push-provider delivery tested on Android; otherwise push remains disabled/unverified.
- [ ] Three.js tested in deployed web browser and supported Android WebView, including offline/CDN failure fallback and pause/resume/resource cleanup.
- [ ] Private report upload/download ownership, limits, authorization, retention and backup tested.
- [ ] Logs/errors/alerts reviewed for secret and unnecessary health-data exposure; runbook and incident response exercised.
- [ ] Privacy notice, consent, AI/provider, caregiver, correction/deletion and retention text reviewed against actual behavior; qualified clinical/legal approval recorded.
- [ ] End-to-end synthetic patient → caregiver → doctor journey passes; evidence stored without unnecessary PHI.

## Production authorization gate

- [ ] Staging acceptance and all blocking defects signed off by release owner and clinical owner.
- [ ] Production database/provider and migration plan independently reviewed; compatibility and recovery/forward-fix plan approved.
- [ ] Verified production backup/PITR, retention, encryption, restore owner, and incident contacts confirmed.
- [ ] Production secrets, origins, CORS, email/provider quotas, rate limits, storage, monitoring, alerts and access controls independently checked.
- [ ] Approved production change window and explicit deployment authorization recorded.
- [ ] Release artifacts are traceable to a commit/build; no secrets included; no public app-store submission unless separately authorized.
- [ ] Post-deploy health, login, assigned patient, critical clinical workflows, notifications and monitoring verified by named operators.
- [ ] Rollback/forward recovery decision owner and communication plan available.

## Release record

| Field | Value |
|---|---|
| Environment | |
| Release/commit identifier | |
| API migration identifier | |
| Web build identifier | |
| Android EAS build ID / artifact | |
| Release owner | |
| Clinical approver | |
| Backup/restore evidence | |
| Outstanding blockers / decision | |
