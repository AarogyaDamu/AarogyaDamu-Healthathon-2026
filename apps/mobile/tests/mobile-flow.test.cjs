const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) => fs.readFileSync(
  path.join(__dirname, '..', relativePath),
  'utf8',
);

test('mobile onboarding leads to patient or caregiver role selection and auth', () => {
  const welcome = source(path.join('app', '(auth)', 'welcome.tsx'));
  const roles = source(path.join('app', '(auth)', 'role-selection.tsx'));
  const roleOptions = roles.match(/const ROLES: RoleOption\[\] = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(roleOptions);
  const roleIds = [...roleOptions.matchAll(/id:\s*'(PATIENT|CAREGIVER|DOCTOR)'/g)].map((match) => match[1]);

  assert.match(welcome, /setMobileOnboardingCompleted\(true\)/);
  assert.match(welcome, /router\.replace\('\/\(auth\)\/role-selection'\)/);
  assert.deepEqual(roleIds, ['PATIENT', 'CAREGIVER']);
  assert.match(roles, /setSelectedMobileRole\(selectedRole\)/);
  assert.match(roles, /pathname: '\/\(auth\)\/auth'/);
});

test('mobile auth supports both patient and caregiver login with role attribution', () => {
  const auth = source(path.join('app', '(auth)', 'auth.tsx'));
  assert.match(auth, /type SelectedMobileRole = 'PATIENT' \| 'CAREGIVER'/);
  assert.match(auth, /const path = isRegister \? '\/auth\/register' : '\/auth\/login'/);
  assert.match(auth, /role: selectedRole/);
  assert.match(auth, /await saveMobileToken\(result\.token, result\.refreshToken\)/);
  assert.match(auth, /await setSelectedMobileRole\(selectedRole\)/);
  assert.match(auth, /router\.replace\('\/session-router'\)/);
});

test('mobile session restoration uses refresh token rotation and handles expiration', () => {
  const client = source(path.join('src', 'api', 'client.ts'));
  const sessionRouter = source(path.join('app', 'session-router.tsx'));

  assert.match(client, /async function rotateMobileRefreshToken/);
  assert.match(client, /const refreshToken = await getMobileRefreshToken\(\)/);
  assert.match(client, /body: JSON\.stringify\(\{ refreshToken \}\)/);
  assert.match(client, /await saveMobileToken\(session\.token, session\.refreshToken\)/);
  assert.match(sessionRouter, /await coordinationApi\.getContext\(\)/);
  assert.match(sessionRouter, /await logoutMobileSession\(\)/);
});

test('mobile logout clears the token but preserves onboarding completion', () => {
  const client = source(path.join('src', 'api', 'client.ts'));
  const profile = source(path.join('app', '(tabs)', 'profile.tsx'));
  const tokenClear = client.match(/export async function clearMobileToken\(\)[\s\S]*?\n\}/)?.[0];

  assert.ok(tokenClear);
  assert.doesNotMatch(tokenClear, /ONBOARDING_KEY|setMobileOnboardingCompleted/);
  assert.match(profile, /await logoutMobileSession\(\)/);
  assert.match(client, /export async function logoutMobileSession/);
  assert.match(client, /\/auth\/logout/);
  assert.match(client, /REFRESH_TOKEN_KEY/);
  assert.match(client, /\/auth\/refresh/);
  assert.match(client, /rotateMobileRefreshToken/);
  assert.match(source(path.join('app', '(auth)', 'auth.tsx')), /saveMobileToken\(result\.token, result\.refreshToken\)/);
  assert.doesNotMatch(client.match(/export async function logoutMobileSession\(\)[\s\S]*?\n\}/)?.[0] ?? '', /ONBOARDING_KEY|setMobileOnboardingCompleted/);
  assert.match(client, /export async function getMobileOnboardingCompleted/);
  assert.match(client, /export async function setMobileOnboardingCompleted/);
});

test('authenticated mobile role routing contains only patient and caregiver destinations', () => {
  const router = source(path.join('app', 'session-router.tsx'));

  assert.match(router, /role === 'CAREGIVER'/);
  assert.match(router, /router\.replace\(routeForRole\(nextRole\)\)/);
  assert.doesNotMatch(router, /'\/\(doctor\)'|router\.replace\(['"]\/\(doctor\)/);
});

test('mobile preserves two-product architecture: doctor routes are excluded from mobile', () => {
  const router = source(path.join('app', 'session-router.tsx'));
  const welcome = source(path.join('app', '(auth)', 'welcome.tsx'));

  // Mobile navigation only leads to tabs (patient) or caregiver
  assert.doesNotMatch(router, /DoctorWorkstation|DoctorDashboard/);
  assert.doesNotMatch(welcome, /DOCTOR/);
});

test('mobile health tab includes P0.1 Unified Health Journal with multi-vital logging and offline queue', () => {
  const health = source(path.join('app', '(tabs)', 'health.tsx'));
  const offline = source(path.join('src', 'api', 'services', 'offlineStorage.ts'));

  // Multi-vital logger supports all 4 required types
  assert.match(health, /BLOOD_GLUCOSE/);
  assert.match(health, /BLOOD_PRESSURE/);
  assert.match(health, /WEIGHT/);
  assert.match(health, /HBA1C/);

  // Offline queue integration
  assert.match(health, /enqueueOfflineObservation/);
  assert.match(health, /syncOfflineQueue/);
  assert.match(offline, /enqueueOfflineObservation/);
  assert.match(offline, /syncOfflineQueue/);
  assert.match(offline, /secondaryValue/);
  assert.match(offline, /sourceProvenance/);
  assert.match(offline, /idempotencyKey/);

  // Provenance attribution for patient and caregiver
  assert.match(health, /sourceProvenance = role === 'CAREGIVER' \? 'CAREGIVER_INPUT' : 'MANUAL_PATIENT'/);
});

test('mobile includes P0.2 Medication Vault with adherence tracking and review status tagging', () => {
  const medications = source(path.join('app', '(tabs)', 'medications.tsx'));
  const medApi = source(path.join('src', 'api', 'medications.ts'));
  const layout = source(path.join('app', '(tabs)', '_layout.tsx'));
  const home = source(path.join('app', '(tabs)', 'index.tsx'));

  // Screen registered in layout and linked from home
  assert.match(layout, /name="medications"/);
  assert.match(home, /\/\(tabs\)\/medications/);

  // Review status distinction
  assert.match(medications, /Clinician Reviewed/);
  assert.match(medications, /Patient Reported \(Unreviewed\)/);

  // Quick adherence actions
  assert.match(medications, /Take Dose/);
  assert.match(medications, /Skip Dose/);
  assert.match(medApi, /recordAdherenceEvent/);

  // Adherence statistics and rate
  assert.match(medications, /14-Day Adherence Rate/);
  assert.match(medApi, /getAdherenceStats/);

  // Status transitions & reasonForChange
  assert.match(medications, /Pause Medication/);
  assert.match(medications, /Reason for pausing medication/);
  assert.match(medApi, /updateMedicationStatus/);

  // Non-prescribing safety guardrail
  assert.match(medications, /AarogyaDamu is a personal health companion, not a prescriber/);
});

test('health vault reports medication endpoint failures separately and supports retry', () => {
  const health = source(path.join('app', '(tabs)', 'health.tsx'));

  assert.match(health, /Promise\.allSettled/);
  assert.match(health, /Medication list:/);
  assert.match(health, /Adherence statistics:/);
  assert.match(health, /Retry loading medication information/);
  assert.match(health, /adherenceRate === null \? '--'/);
});

test('mobile includes P0.3 Lifestyle Tracking & Digital Health Twin with read-only twin and correction reason', () => {
  const lifestyle = source(path.join('app', '(tabs)', 'lifestyle.tsx'));
  const lifestyleApi = source(path.join('src', 'api', 'lifestyle.ts'));
  const layout = source(path.join('app', '(tabs)', '_layout.tsx'));
  const home = source(path.join('app', '(tabs)', 'index.tsx'));

  // Screen registered in layout and linked from home
  assert.match(layout, /name="lifestyle"/);
  assert.match(home, /\/\(tabs\)\/lifestyle/);

  // Categories supported
  assert.match(lifestyle, /PHYSICAL_ACTIVITY/);
  assert.match(lifestyle, /SLEEP/);
  assert.match(lifestyle, /NUTRITION/);
  assert.match(lifestyle, /HYDRATION/);
  assert.match(lifestyle, /WELLBEING/);

  // Digital Health Twin read-only guardrails & non-simulation disclaimer
  assert.match(lifestyle, /Digital Health Twin/);
  assert.match(lifestyle, /Personal Digital Health Twin \(Read-Only\)/);
  assert.match(lifestyle, /rule-based aggregation/);
  assert.match(lifestyle, /does not predict future values/);
  assert.match(lifestyle, /PENDING_CLINICIAN_APPROVAL/);

  // Mandatory correction reason on edit
  assert.match(lifestyle, /Reason for correction/);
  assert.match(lifestyleApi, /reasonForCorrection/);

  // API endpoints integration
  assert.match(lifestyleApi, /getRecords/);
  assert.match(lifestyleApi, /createRecord/);
  assert.match(lifestyleApi, /updateRecord/);
  assert.match(lifestyleApi, /getDigitalHealthTwin/);
});

test('mobile includes P0.4 Notifications, Reminders & Emergency SOS with deliberate activation and safety disclaimers', () => {
  const sos = source(path.join('app', '(tabs)', 'sos.tsx'));
  const notifApi = source(path.join('src', 'api', 'notifications.ts'));
  const layout = source(path.join('app', '(tabs)', '_layout.tsx'));
  const home = source(path.join('app', '(tabs)', 'index.tsx'));

  // Screen registered in layout and linked from home
  assert.match(layout, /name="sos"/);
  assert.match(home, /\/\(tabs\)\/sos/);

  // Deliberate activation with 2-step confirmation
  assert.match(sos, /Confirm Emergency SOS/);
  assert.match(sos, /confirmEmergency/);
  assert.match(sos, /Activate SOS Now/);
  assert.match(notifApi, /confirmEmergency: true/);

  // Clear emergency limitation disclaimer (NOT 112 / 108 substitute)
  assert.match(sos, /EMERGENCY NOTICE \(NOT 112 \/ 108\)/);
  assert.match(sos, /NOT a substitute for local emergency services/);
  assert.match(sos, /immediately call 112 or 108/);

  // Delivery status transparency
  assert.match(sos, /In-app dispatched; no SMS provider configured/);
  assert.match(notifApi, /externalCarrierStatus: 'UNCONFIGURED'/);

  // Accidental activation cancellation requiring explanation
  assert.match(sos, /Cancel Accidental Activation/);
  assert.match(sos, /Cancel SOS False Alarm/);
  assert.match(sos, /minimum 3 characters/);

  // Emergency contacts management
  assert.match(sos, /Emergency Contacts/);
  assert.match(sos, /Add Emergency Contact/);
  assert.match(notifApi, /getContacts/);
  assert.match(notifApi, /createContact/);
  assert.match(notifApi, /deleteContact/);

  // Reminders safety rules: never auto-mark taken, never alter prescriptions
  assert.match(sos, /Reminders never auto-mark medications as taken/);
  assert.match(sos, /never alter clinical prescriptions/);
  assert.match(sos, /acknowledge this reminder does NOT modify any clinical prescription/);
  assert.match(notifApi, /acknowledgeReminder/);
  assert.match(notifApi, /createReminder/);
  assert.match(notifApi, /getNotifications/);
  assert.match(notifApi, /markAllAsRead/);
});

test('mobile preserves two-product architecture: ambient scribe recording and clinician note approval are excluded from mobile', () => {
  const layout = source(path.join('app', '(tabs)', '_layout.tsx'));
  const home = source(path.join('app', '(tabs)', 'index.tsx'));
  const sessionRouter = source(path.join('app', 'session-router.tsx'));

  // Mobile layout tabs only include patient features
  assert.doesNotMatch(layout, /scribe|consultation-prep|doctor-review/i);

  // Home screen does not contain clinician recording or approval actions
  assert.doesNotMatch(home, /startScribe|ambientScribe|approveNote|rejectDraft/i);

  // Session router never exposes doctor workstation or scribe to mobile
  assert.doesNotMatch(sessionRouter, /ConsultationPrep|DoctorDashboard/);
});

test('mobile P0.6 Damu Voice Companion enforces zero-retention, informed consent, non-doctor disclaimer, and multilingual selection', () => {
  const damu = source(path.join('app', '(tabs)', 'damu.tsx'));
  const damuApi = source(path.join('src', 'api', 'damu.ts'));
  const layout = source(path.join('app', '(tabs)', '_layout.tsx'));
  const home = source(path.join('app', '(tabs)', 'index.tsx'));

  // Route registration
  assert.match(layout, /name="damu"/);
  assert.match(home, /\/\(tabs\)\/damu/);

  // Client API bindings
  assert.match(damuApi, /getStatus/);
  assert.match(damuApi, /interact/);
  assert.match(damuApi, /\/damu\/interact/);
  assert.match(damuApi, /\/damu\/status/);

  // Zero-retention privacy assurance
  assert.match(damu, /Zero-Retention Privacy/);
  assert.match(damu, /0 days stored/i);

  // Explicit informed consent enforcement
  assert.match(damu, /Informed Patient Consent/);
  assert.match(damu, /consentObtained: true/);
  assert.match(damu, /consentGiven/);

  // Non-doctor boundary and emergency disclaimer
  assert.match(damu, /educational companion, not a doctor/i);
  assert.match(damu, /cannot diagnose/i);
  assert.match(damu, /112 or 108/);

  // Regional language selection support
  assert.match(damu, /en-IN/);
  assert.match(damu, /hi-IN/);
  assert.match(damu, /te-IN/);
  assert.match(damu, /ta-IN/);

  // Voice state machine
  assert.match(damu, /listening/);
  assert.match(damu, /processing/);
  assert.match(damu, /responding/);
  assert.match(damu, /idle/);

  // Native audio recording and speech synthesis (SEC-03)
  assert.match(damu, /from 'expo-av'/);
  assert.match(damu, /from 'expo-speech'/);
  assert.match(damu, /Audio\.requestPermissionsAsync/);
  assert.match(damu, /Audio\.Recording\.createAsync/);
  assert.match(damu, /Speech\.speak/);
  assert.match(damu, /Speech\.stop/);
});
