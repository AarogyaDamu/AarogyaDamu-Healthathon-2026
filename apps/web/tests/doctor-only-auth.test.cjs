const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) => fs.readFileSync(
  path.join(__dirname, '..', 'src', relativePath),
  'utf8',
);

test('unauthenticated web composition is doctor-only and excludes mobile shell routes', () => {
  const app = source('App.tsx');
  const authPage = source(path.join('pages', 'Auth.tsx'));

  assert.match(app, /return <AuthPage \/>/);
  assert.match(app, /!token \|\| !user\?\.isClinician/);
  assert.match(app, /<DoctorWorkstation/);
  assert.match(app, /window\.history\.replaceState\(null, '', '\/login'\)/);
  assert.doesNotMatch(app, /PatientSwitcher|CaregiverConnect|<Navbar|needsOnboarding/);
  assert.match(authPage, /Doctor Login/);
  assert.match(authPage, /Doctor Registration/);
  assert.doesNotMatch(authPage, /Patient demo|Caregiver demo|Clinical Onboarding Baseline|role-selection/i);
});

test('web authentication trusts the verified API doctor role and clears rejected sessions', () => {
  const authContext = source(path.join('context', 'AuthContext.tsx'));
  const apiClient = source(path.join('api', 'client.ts'));

  assert.ok(authContext.includes("apiFetch<MeResponse>('/auth/me')"));
  assert.match(authContext, /response\.user\?\.isClinician !== true/);
  assert.match(authContext, /verified\.user\?\.isClinician !== true/);
  assert.ok(authContext.includes("'/auth/doctor/register'"));
  assert.match(authContext, /clearAuthToken\(\)/);
  assert.match(authContext, /setActiveTargetPatientId\(null\)/);
  assert.match(authContext, /clearApiCache\(\)/);
  assert.ok(authContext.includes("apiFetch<{ success: boolean }>('/auth/logout'"));
  assert.match(apiClient, /REFRESH_TOKEN_KEY/);
  assert.match(apiClient, /\/auth\/refresh/);
  assert.match(apiClient, /setAuthSession/);
});

test('doctor workstation provides profile access and confirmed sign out', () => {
  const workstation = source(path.join('components', 'DoctorWorkstation.tsx'));

  assert.match(workstation, /aria-haspopup="menu"/);
  assert.match(workstation, /role="menuitem"[\s\S]*?Profile/);
  assert.match(workstation, /role="alertdialog"/);
  assert.match(workstation, /Sign Out/);
});

test('doctor dashboard patient command center provides P0.1 Unified Health Journal with ambulatory stats and point-of-care logging', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Journal tab added to command center drawer
  assert.match(dashboard, /'OVERVIEW' \| 'JOURNAL' \| 'MEDICATIONS' \| 'LIFESTYLE_TWIN' \| 'SAFETY_SOS' \| 'FOLLOW_UP' \| 'CHAT' \| 'FEED'/);
  assert.match(dashboard, /Health Journal/);

  // Ambulatory statistics integration
  assert.match(dashboard, /14-Day Ambulatory Profile/);
  assert.match(dashboard, /vitalStats\.timeInRange/);
  assert.match(dashboard, /vitalStats\.mean/);

  // In-clinic point-of-care vital entry
  assert.match(dashboard, /In-Clinic Vital/);
  assert.match(dashboard, /sourceProvenance:\s*'DOCTOR_CLINICAL'/);

  // Chronological observations with provenance badge
  assert.match(dashboard, /Doctor Point-of-Care/);
  assert.match(dashboard, /Patient Self-Logged/);
  assert.match(dashboard, /Caregiver Entry/);
});

test('doctor dashboard provides P0.2 Medication Vault & Clinical Reconciliation with adherence tracking', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Medication reconciliation tab integration
  assert.match(dashboard, /id:\s*'MEDICATIONS'/);
  assert.match(dashboard, /Medication Vault & Clinical Reconciliation/);

  // 14-Day Adherence profile
  assert.match(dashboard, /14-Day Patient Adherence Profile/);
  assert.match(dashboard, /medicationAdherenceStats\.adherenceRate/);

  // Clinician review and reconciliation
  assert.match(dashboard, /Review & Reconcile/);
  assert.match(dashboard, /Clinician Review & Reconciliation/);
  assert.match(dashboard, /\/medications\/\$\{reviewingMed\.id\}\/review/);

  // In-clinic prescription
  assert.match(dashboard, /In-Clinic Prescription/);
  assert.match(dashboard, /handleCreatePrescription/);

  // Status transitions requiring reasonForChange
  assert.match(dashboard, /Reason for Change/);
  assert.match(dashboard, /statusChangeReason/);

  // Review status badges
  assert.match(dashboard, /Clinician Reviewed/);
  assert.match(dashboard, /Patient Reported \(Unreviewed\)/);

  // Autonomous prescribing prevention guardrail
  assert.match(dashboard, /AarogyaDamu does not act as an autonomous prescriber/);
});

test('doctor dashboard provides P0.3 Lifestyle Tracking & Digital Health Twin with read-only twin and data quality alerts', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Sub-tab navigation and drawer integration
  assert.match(dashboard, /id:\s*'LIFESTYLE_TWIN'/);
  assert.match(dashboard, /Lifestyle Tracking & Digital Health Twin/);
  assert.match(dashboard, /Lifestyle & Digital Health Twin Snapshot/);

  // 7-day habit metrics
  assert.match(dashboard, /7-Day Habit Metrics/);
  assert.match(dashboard, /lifestyleStats\.physicalActivity\?\.totalMinutes/);
  assert.match(dashboard, /lifestyleStats\.sleep\?\.averageHoursPerNight/);
  assert.match(dashboard, /lifestyleStats\.hydration\?\.dailyAverageMl/);

  // Read-only twin representation & clinical governance
  assert.match(dashboard, /Personal Digital Health Twin \(Read-Only Clinician View\)/);
  assert.match(dashboard, /PENDING_CLINICIAN_APPROVAL/);
  assert.match(dashboard, /AarogyaDamu does not predict future glucose trajectories/);
  assert.match(dashboard, /Correlations between lifestyle habits and glucose do not establish clinical causation/);

  // Data quality alerts display
  assert.match(dashboard, /digitalHealthTwin\?\.dataQualityAlerts/);
  assert.match(dashboard, /Data Quality Notice:/);

  // 4 pillars synthesis
  assert.match(dashboard, /Four Health Pillars \(Rule-Based Synthesis\)/);
  assert.match(dashboard, /Glycemic & Vitals Profile/);
  assert.match(dashboard, /Time in Range \(70-180 mg\/dL\)/);

  // Multi-source provenance & correction tracking
  assert.match(dashboard, /Clinician Entry/);
  assert.match(dashboard, /Caregiver/);
  assert.match(dashboard, /Patient/);
  assert.match(dashboard, /Correction: \{r\.reasonForCorrection\}/);
});

test('doctor dashboard provides P0.4 Notifications, Reminders & Emergency SOS with active alert banner and safety hub', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Sub-tab navigation and drawer integration
  assert.match(dashboard, /id:\s*'SAFETY_SOS'/);
  assert.match(dashboard, /label: 'SOS'/);
  assert.match(dashboard, /Emergency SOS, Safety Coordinator & Care Reminders/);

  // Critical active SOS banner at top of command center
  assert.match(dashboard, /CRITICAL: ACTIVE EMERGENCY SOS/);
  assert.match(dashboard, /activeSosEvent/);

  // Emergency limitation disclaimer (Not 112 / 108 Substitute)
  assert.match(dashboard, /Emergency Escalation Notice \(Not 112 \/ 108 Substitute\)/);
  assert.match(dashboard, /NOT a substitute for local emergency services/);
  assert.match(dashboard, /immediately dial 112 or 108/);

  // Delivery status transparency
  assert.match(dashboard, /in-app dispatched; externalCarrierStatus/);

  // Emergency contacts ledger
  assert.match(dashboard, /Registered Emergency Contacts/);
  assert.match(dashboard, /Receives In-App SOS/);

  // Care reminders ledger and non-prescribing safety guardrail
  assert.match(dashboard, /Patient Care Reminders/);
  assert.match(dashboard, /Safety rule: Reminders are patient- or caregiver-scheduled notifications/);
  assert.match(dashboard, /never alter clinical prescriptions, modify dosages, or automatically mark medications as taken/);

  // Clinical approval status
  assert.match(dashboard, /PENDING_CLINICIAN_APPROVAL/);
});
