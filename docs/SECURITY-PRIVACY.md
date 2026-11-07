# AarogyaDamu — Security, Privacy & Compliance Architecture

**Classification:** Digital Health Platform Security Whitepaper
**Target Standard:** HIPAA Security Rule, GDPR Article 9 (Health Data), DISHA, ISO 27001
**Scope:** Doctor WebApp, Patient Mobile App, Caregiver Mobile App, Core Express API, HL7 FHIR Interoperability Layer

---

## 1. Authentication & Session Security

1. **Cryptographic Token Architecture:**
   - Stateless JWT access tokens signed with HMAC-SHA256 (`HS256`) using minimum 256-bit entropy secrets (`JWT_SECRET`).
   - Short access token lifespan (15 minutes).
   - Stateful refresh sessions persisted in the database (`AuthSession` and `RefreshToken` models).
2. **Refresh Token Rotation & Single-Use Enforcement:**
   - Every refresh request invalidates the presenting refresh token and generates a cryptographically distinct successor hash (`rotateRefreshToken`).
   - Immediate session revocation upon detected replay or token reuse.
3. **Session Revocation & Logout:**
   - Full server-side revocation on logout (`/api/auth/logout`) and multi-device revocation (`/api/auth/revoke-all`).
   - Expired tokens and revoked sessions return deterministic HTTP 401 with immediate client clearance.
4. **Password Security:**
   - Passwords hashed using bcrypt with work factor 10.
   - Enforced password complexity: minimum 8 characters, maximum 128 characters.
5. **Rate Limiting & Brute-Force Defense:**
   - Strict sliding-window rate limiting applied to auth endpoints (`10 requests per 15 minutes` for login and password reset).
   - Global rate limiter on all public API endpoints (`100 requests per 15 minutes`).

---

## 2. Role-Based Access Control (RBAC) & Context Isolation

The system strictly isolates three principal roles:

1. **CLINICIAN (Doctor):**
   - Access restricted to verified clinician accounts (`isClinician: true`).
   - Doctors may only view and mutate records of patients explicitly linked via an `ACTIVE` `DoctorPatientAssignment`.
   - Access to unassigned patient records returns HTTP 403 `UNASSIGNED_CLINICIAN`.
2. **PATIENT:**
   - Full ownership of master health record, self-observations, and care activities.
   - Explicit grantor of caregiver consent.
   - Prohibited from accessing clinician-only prescribing or approval endpoints.
3. **CAREGIVER (Family Companion):**
   - Access governed strictly by active patient consent records (`CaregiverConsent`).
   - Cannot create, edit, or delete patient health data unless granted granular permission.
   - Revoked or expired consent immediately cuts off all caregiver access.

---

## 3. Server-Side Caregiver Consent Enforcement

Caregiver access is enforced **server-side on every API request** via `resolvePatientContext(req, requiredPermission)`:

```
[Incoming Request with x-target-patient-id]
                  │
                  ▼
   Is user accessing their own record?
        ├── YES ──► Grant Direct Access
        └── NO  ──► Check Role
                      ├── CLINICIAN ──► Check Active DoctorPatientAssignment
                      └── CAREGIVER ──► Query CaregiverConsent table:
                                          ├── Status === 'ACTIVE'
                                          ├── expiresAt > NOW()
                                          └── permissions.includes(requiredPermission)
                                                ├── YES ──► Grant Delegated Access
                                                └── NO  ──► HTTP 403 Forbidden
```

### Granular Consent Permissions:
- `VIEW_OBSERVATIONS`: Read blood glucose, blood pressure, weight history.
- `VIEW_CARE_PLAN`: Read assigned goals and care plan targets.
- `VIEW_DOCUMENTS`: Read uploaded lab reports and prescriptions.
- `MANAGE_TASKS`: Complete or update delegated care activities.
- `RECEIVE_ALERTS`: Receive emergency alerts and notifications.

---

## 4. Synthetic-Only Demonstration Policy

To guarantee zero patient privacy exposure for Health-a-thon evaluation and public GitHub hosting:
- 100% of demonstration data is generated synthetically (`isSyntheticDemo: true`).
- All local database files, SQLite backups, and patient document uploads have been purged from the repository.
- Demo accounts utilize synthetic local domains (`@aarogyadamu.local`) and fictional identities.

---

## 5. Network & Transport Security

- **Strict HTTPS Enforcement:** HSTS enabled with `max-age=31536000; includeSubDomains`.
- **Security Headers:**
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
- **CORS Protection:** Strict origin allowlist (`ALLOWED_ORIGINS`). Cross-origin wildcard (`*`) is permanently forbidden in production.
- **Proxy Hardening:** Reverse-proxy hop verification prevents spoofed `X-Forwarded-For` header spoofing.

---

## 6. Audit Logging & Immutable Event Trails

Every clinical mutation and data access event is captured via `AuditLog` and exposed via FHIR R4 `AuditEvent`:
- Recorded timestamp (ISO 8601).
- Initiating user ID and authenticated role.
- Target patient ID.
- Action code (e.g. `CREATE_OBSERVATION`, `AMEND_OBSERVATION`, `APPROVE_PROPOSAL`, `REVOKE_CONSENT`).
- Outcome status (Success `0` vs Failure `4`).
- Forensic tamper protection.
