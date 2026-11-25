# CI/CD Deployment Activation Runbook

## 1. Overview & Current Safety State

In accordance with AarogyaDamu Application Security and Clinical Safety guidelines, **continuous automated deployment is disabled by default** in `.github/workflows/ci.yml`.

- The `validate-and-test` job runs automatically on all pull requests and pushes to `main`, validating:
  1. Clean dependency installation (`npm ci` on Node.js 22 LTS)
  2. Secret scanning against uncommitted `.env` files
  3. Prisma schema validation & migration application on disposable PostgreSQL
  4. Full static typechecking across all monorepo workspaces
  5. Backend unit and integration test suites (including RLS, FHIR R4, and LOINC validation)
  6. Web and mobile frontend test suites
  7. Production bundle compilation for Web, API, and Mobile Web
- The deployment jobs (`deploy-staging` and `deploy-production`) have condition `if: false` to ensure zero accidental network or infrastructure mutation until explicitly authorized.

---

## 2. Pre-requisites for Deployment Activation

Before removing the `if: false` deployment locks, ensure the following prerequisites are met:

### A. Environment Configuration in GitHub Repository Settings
Navigate to **Settings → Environments** and configure two protected environments:

1. **`staging`**:
   - Environment Secrets:
     - `DATABASE_URL`: Staging PostgreSQL 16+ connection string (`sslmode=require`)
     - `JWT_SECRET`: High-entropy 32+ character string
     - `DOCTOR_INVITATION_SECRET`: Dedicated 32+ character random secret
     - `DOCTOR_INVITATION_ADMIN_KEY`: Dedicated 32+ character admin provisioning key
     - `ALLOWED_ORIGINS`: Staging frontend origins (e.g. `https://staging-doctor.aarogyadamu.net`)
     - `RESEND_API_KEY`: Staging transactional email key
     - `DEPLOY_HOST_SSH_KEY` / `CONTAINER_REGISTRY_TOKEN`: Hosting platform credentials
   - Deployment Branches: Restrict to `main`.

2. **`production`**:
   - Environment Protection Rules:
     - **Required Reviewers**: Add at least two designated clinical & DevOps architects.
     - **Wait Timer**: (Optional) 15-minute soak timer.
     - **Deployment Branches**: Restrict to tag pattern `v*`.
   - Environment Secrets:
     - Production counterparts of all secrets listed under staging.

---

## 3. Activation Steps in `.github/workflows/ci.yml`

When authorization is formally granted, edit `.github/workflows/ci.yml`:

### Step 1: Enable Staging Deployment
Change line 138:
```yaml
  deploy-staging:
    name: Continuous Delivery (Staging)
    needs: validate-and-test
    # Replace: if: false
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging-doctor.aarogyadamu.net
```

### Step 2: Enable Production Deployment
Change line 170:
```yaml
  deploy-production:
    name: Continuous Delivery (Production)
    needs: validate-and-test
    # Replace: if: false
    if: startsWith(github.ref, 'refs/tags/v') && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://doctor.aarogyadamu.net
```

---

## 4. Post-Deployment Verification & Smoke Testing

Upon release, the pipeline automatically executes health probes:
1. `GET /health/live` returns HTTP 200 `{ status: "ok" }`.
2. `GET /health/ready` returns HTTP 200 `{ status: "ready", database: "connected" }`.
3. Hard-refresh on protected web routes (e.g. `/patients`) verifies SPA fallback.
4. Verify that demo login is completely rejected (`403 FORBIDDEN`).

---

## 5. Rollback Procedure

If any health check or smoke test fails after deployment:
1. **API / Web Rollback**: Revert to previous release tag:
   ```bash
   git checkout tags/v1.0.X
   # Trigger emergency hotfix deployment
   ```
2. **Database Rollback**:
   - Never run `prisma migrate reset` in staging or production.
   - Point the application to the pre-deployment PITR backup snapshot taken during Step 2 of the release checklist.

