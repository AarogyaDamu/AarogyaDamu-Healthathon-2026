# Phase 8 â€” Controlled Pilot Operations Guide

## Pilot objectives

Evaluate the usability and operational fit of the diabetes care journey companion with **synthetic data first**, supervised by qualified clinicians. This guide does not authorize real-patient onboarding or imply regulatory clearance. A pilot may begin only after its environment, privacy/consent materials, clinical owner, support contacts, and release gates are approved.

## Scope and supported roles

- **Patient:** Android companion for profile, health records, glucose, prescribed medication visibility, adherence, tasks, appointments, approved summaries, notifications, and Damu.
- **Caregiver:** Dedicated mobile workspace limited to the patient-approved permission scopes; access must be revoked when consent ends.
- **Doctor:** Web workstation for assigned patients, appointments, prescriptions, care tasks, consultation documentation, sharing, and journey monitoring.

Included: clinician-supervised education and care coordination. Excluded until separately approved: autonomous diagnosis/treatment, automatic prescribing, emergency-service dispatch guarantees, live push delivery, unverified AI/transcription providers, public app-store release, and unsupervised clinical use.

## Readiness prerequisites

1. Obtain written pilot-owner, clinician, privacy, and legal approvals, including applicable Indian data-protection review.
2. Deploy a separately isolated staging database/API/web app. **The current repository is SQLite-only and blocks staging/production API startup; do not use the development database as a substitute.**
3. Provision unique test-only accounts and synthetic records using a guarded development-only seed process or an approved staging provisioning path.
4. Configure the API, HTTPS mobile/web endpoints, email, AI/transcription and notification providers as applicable. Record which providers are live and which capabilities are disabled.
5. Create a versioned Android internal build; verify installation, account logout/switching, permissions, connectivity, accessibility, and recovery on supported devices.
6. Name the clinical lead, technical on-call, privacy contact, escalation channel, support hours, and incident record location.

## Onboarding and device setup

### Doctors

1. Administrator verifies clinician identity and issues an individual, time-limited invitation out of band.
2. Doctor completes account setup, MFA/credential policy as approved by the pilot, and workstation orientation.
3. Confirm patient assignments and that the doctor can access only assigned records.
4. Demonstrate prescription responsibility, consultation documentation, explicit patient-summary sharing, and escalation boundaries.

### Patients

1. Obtain and document the pilot's informed participation and data-processing consent before account provisioning.
2. Provide the patient with the approved privacy notice, AI/provider disclosure, caregiver-permission explanation, support contact, correction/deletion process, and emergency disclaimer.
3. Provision a unique account through an approved administrator workflow; do not share passwords or use public/demo credentials.
4. Install only the approved internal Android build, verify its version and configured staging API, and sign in.
5. Complete profile and notification preferences; confirm the patient can review records, contact the clinical team, and sign out.

### Caregivers

1. Patient initiates the invitation and explicitly chooses the allowed access scopes.
2. Caregiver accepts using an individual account and receives the dedicated workspace orientation.
3. Confirm permitted information/actions, actor attribution, patient switching, device logout, and how the patient revokes access.
4. Test revocation before live use: the caregiver must lose subsequent protected access; investigate stale cached data and notifications.

## Supported workflows

### Patient

Sign in â†’ review Health Vault â†’ enter a glucose reading â†’ review clinician-prescribed medications â†’ record adherence â†’ complete an assigned task â†’ request an appointment â†’ view clinician-approved/shared summary â†’ review journey â†’ manage notification preferences â†’ use Damu only as disclosed and within clinical boundaries â†’ sign out.

### Doctor

Sign in -> open an assigned patient -> review records and appointments -> create prescriptions or tasks as clinically appropriate -> conduct consultation -> document relevant clinical information through the supported workflow -> explicitly share the patient summary -> verify audit attribution and journey state.

### Caregiver

Accept patient invitation â†’ select the authorized patient â†’ review only granted information â†’ perform only explicitly authorized delegated actions â†’ verify actor attribution â†’ sign out. Re-test immediately after consent revocation.

## Support and incident escalation

| Issue | Immediate response | Escalation |
|---|---|---|
| Login/account provisioning | Verify account state and correct environment; do not request password or token over chat | Technical support; clinician/admin for identity or invitation |
| Caregiver access or revocation | Stop delegated actions; verify consent status and protected endpoint access | Privacy lead and technical on-call; document access timeline |
| Prescription/task/appointment missing | Do not infer or recreate clinical instructions | Assigned clinician; technical support for record reconciliation |
| Clinical documentation issue | Follow the approved clinical documentation process; never treat an unverified AI-generated response as a clinical instruction | Doctor and technical on-call |
| Notification not received | Check in-app event and provider state; use approved direct clinical contact for time-sensitive matters | Technical on-call/provider owner |
| Damu uncertain, unsafe, or contradictory | Stop relying on the response; preserve a minimal incident reference without copying unnecessary PHI | Clinician immediately for clinical concern; safety and technical leads |
| Emergency warning or acute symptoms | Follow local emergency guidance and contact emergency services/clinician; app delivery is not guaranteed | Clinical lead; record incident after immediate safety needs |
| Correction/deletion request | Acknowledge and route; do not delete records outside approved retention/legal workflow | Privacy/data administrator and responsible clinician |
| Suspected privacy/security incident | Stop affected workflow, preserve evidence, restrict access if authorized | Incident lead/privacy officer immediately |

Do not include passwords, tokens, raw audio, or unnecessary patient data in support tickets. Record time, app version, environment, role, redacted error/incident ID, and actions taken.

## Feedback collection

Collect voluntary feedback using a separate consent-aware research/operations form. Ask about navigation, clarity, notification usefulness, Damu usefulness, clinician efficiency, caregiver usability, and technical problems. Do not copy feedback automatically into the clinical record. Restrict access, define retention, and avoid unnecessary health details.

## Pilot completion criteria

Close the pilot only after the clinical owner reconciles outstanding clinical workflows; support/privacy incidents are triaged; participants receive account/data next steps; data retention/deletion actions are completed under the approved policy; test accounts/tokens are revoked; and the team records usability, reliability, provider, and unresolved risk findings. A successful demonstration alone is not clinical validation.


