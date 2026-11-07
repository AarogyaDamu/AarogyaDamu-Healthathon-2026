const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

// ===========================================================================
// 1. WORKSPACE GUARD & ROLE ROUTING FOR CAREGIVER
// ===========================================================================
test('Caregiver workspace layout enforces CAREGIVER role boundary with WorkspaceGuard', () => {
  const layout = source(path.join('app', '(caregiver)', '_layout.tsx'));
  const guard = source(path.join('src', 'features', 'coordination', 'WorkspaceGuard.tsx'));

  // Ensure WorkspaceGuard wraps the caregiver tabs layout
  assert.match(layout, /<WorkspaceGuard role="CAREGIVER">/);
  assert.match(guard, /function routeForRole\(role: MobileRole\): '\/\(tabs\)' \| '\/\(caregiver\)'/);
  assert.match(guard, /if \(role === 'CAREGIVER'\) return '\/\(caregiver\)';/);
  assert.match(guard, /return '\/\(tabs\)';/);

  // Tab navigation structure
  assert.match(layout, /name="index"/);
  assert.match(layout, /name="tasks"/);
  assert.match(layout, /name="medications"/);
  assert.match(layout, /name="health"/);
  assert.match(layout, /name="profile"/);
});

// ===========================================================================
// 2. PATIENT SWITCHER & ASYNCSTORAGE PERSISTENCE
// ===========================================================================
test('Caregiver API provides AsyncStorage persistence for active patient context', () => {
  const caregiverApi = source(path.join('src', 'api', 'caregiver.ts'));

  assert.match(caregiverApi, /const ACTIVE_PATIENT_KEY = '@aarogyadamu\/caregiver\/active_patient_id';/);
  assert.match(caregiverApi, /async getActivePatientId\(\): Promise<string \| null>/);
  assert.match(caregiverApi, /AsyncStorage\.getItem\(ACTIVE_PATIENT_KEY\)/);
  assert.match(caregiverApi, /async setActivePatientId\(patientId: string\): Promise<void>/);
  assert.match(caregiverApi, /AsyncStorage\.setItem\(ACTIVE_PATIENT_KEY, patientId\)/);
  assert.match(caregiverApi, /async clearActivePatientId\(\): Promise<void>/);
  assert.match(caregiverApi, /AsyncStorage\.removeItem\(ACTIVE_PATIENT_KEY\)/);
});

test('Caregiver Home Screen supports multi-patient switching and persists selection', () => {
  const home = source(path.join('app', '(caregiver)', 'index.tsx'));

  // Patient selector state & persistence
  assert.match(home, /const \[patients, setPatients\] = useState<CaregiverPatient\[\]>\(\[\]\);/);
  assert.match(home, /const \[selectedPatientId, setSelectedPatientId\] = useState<string \| null>\(null\);/);
  assert.match(home, /caregiverApi\.getActivePatientId\(\)/);
  assert.match(home, /caregiverApi\.setActivePatientId\(/);
  assert.match(home, /showPatientPicker/);
  assert.match(home, /handleSelectPatient/);
});

// ===========================================================================
// 3. RESTRICTED HEALTH VIEW WHEN VIEW_HEALTH_SUMMARY IS MISSING
// ===========================================================================
test('Caregiver Health Screen displays locked restriction banner when VIEW_HEALTH_SUMMARY is missing', () => {
  const health = source(path.join('app', '(caregiver)', 'health.tsx'));

  // Permission evaluation
  assert.match(health, /hasHealthPermission/);
  assert.match(health, /VIEW_HEALTH_SUMMARY/);
  assert.match(health, /Health Summary Permission Required/);
  assert.match(health, /lockedContainer/);

  // Gated rendering of clinical observation metrics
  assert.match(health, /averageGlucose/);
  assert.match(health, /timeInRangePercentage/);
});

// ===========================================================================
// 4. RESTRICTED MEDICATION VIEW WHEN VIEW_MEDICATIONS IS MISSING
// ===========================================================================
test('Caregiver Medications Screen displays locked restriction banner when VIEW_MEDICATIONS is missing', () => {
  const meds = source(path.join('app', '(caregiver)', 'medications.tsx'));

  // Permission evaluation
  assert.match(meds, /perms\.includes\('VIEW_MEDICATIONS'\)/);
  assert.match(meds, /Requires VIEW_MEDICATIONS permission to inspect prescribed medicines/);
  assert.match(meds, /DOCTOR-PRESCRIBED MEDICINES/);
  assert.match(meds, /Prescriptions are strictly doctor-managed/);
  assert.match(meds, /Caregivers cannot create, alter dosages, pause, or delete clinical prescriptions/);
});

// ===========================================================================
// 5. READ-ONLY TASKS VIEW WHEN COMPLETE_TASKS_ON_BEHALF IS MISSING
// ===========================================================================
test('Caregiver Tasks Screen enforces read-only mode when COMPLETE_TASKS_ON_BEHALF is missing', () => {
  const tasks = source(path.join('app', '(caregiver)', 'tasks.tsx'));

  // Task viewing requires VIEW_TASKS
  assert.match(tasks, /perms\.includes\('VIEW_TASKS'\)/);
  // Completion capability checked via canCompleteOnBehalf / canComplete
  assert.match(tasks, /canCompleteOnBehalf/);
  assert.match(tasks, /Read-Only Mode/);
  assert.match(tasks, /Requires COMPLETE_TASKS_ON_BEHALF permission from patient to complete/);
  assert.match(tasks, /readOnlyFooter/);
});

// ===========================================================================
// 6. AUTHORIZED TASK COMPLETION WITH ACTOR ATTRIBUTION & NOTES
// ===========================================================================
test('Caregiver Tasks Screen allows authorized task completion with attribution and notes modal', () => {
  const tasks = source(path.join('app', '(caregiver)', 'tasks.tsx'));
  const api = source(path.join('src', 'api', 'caregiver.ts'));

  // Completion modal & notes input
  assert.match(tasks, /Confirm Task Completion/);
  assert.match(tasks, /caregiverNote/);
  assert.match(tasks, /caregiverApi\.completeTask\(/);
  assert.match(api, /completeTask\(patientId: string, taskId: string, notes\?: string\)/);
  assert.match(tasks, /Complete on Patient's Behalf/);
});

// ===========================================================================
// 7. IMMEDIATE CACHE & STATE WIPE UPON REVOCATION OR LOGOUT
// ===========================================================================
test('Caregiver profile and home handle session wipe and cache cleanup on logout or zero patients', () => {
  const profile = source(path.join('app', '(caregiver)', 'profile.tsx'));
  const home = source(path.join('app', '(caregiver)', 'index.tsx'));

  // Profile logout clears active patient and session
  assert.match(profile, /await caregiverApi\.clearActivePatientId\(\)/);
  assert.match(profile, /await logoutMobileSession\(\)/);
  assert.match(profile, /router\.replace\('\/\(auth\)\/welcome'\)/);

  // Home screen clears active patient when patient list is empty (revocation fallback)
  assert.match(home, /if \(patientList\.length === 0\) \{/);
  assert.match(home, /await caregiverApi\.clearActivePatientId\(\)/);
});

// ===========================================================================
// 8. PATIENT-SIDE CAREGIVER ACCESS MANAGER WITH EDIT & REVOCATION MODALS
// ===========================================================================
test('Patient Profile provides full Caregiver Access Manager with permission editing and revocation', () => {
  const patientProfile = source(path.join('app', '(tabs)', 'profile.tsx'));

  // Caregiver Access Manager section & modals
  assert.match(patientProfile, /Caregiver Access Manager/);
  assert.match(patientProfile, /showInviteCaregiver/);
  assert.match(patientProfile, /editingConsent/);
  assert.match(patientProfile, /showCaregiverActions/);

  // Revocation workflow
  assert.match(patientProfile, /handleRevokeCaregiver/);
  assert.match(patientProfile, /Revoke Caregiver Access/);
  assert.match(patientProfile, /caregiverApi\.revokeConsent/);

  // All 8 canonical permissions available in invite / edit selector
  assert.match(patientProfile, /VIEW_HEALTH_SUMMARY/);
  assert.match(patientProfile, /VIEW_MEDICATIONS/);
  assert.match(patientProfile, /VIEW_MEDICATION_ADHERENCE/);
  assert.match(patientProfile, /VIEW_TASKS/);
  assert.match(patientProfile, /COMPLETE_TASKS_ON_BEHALF/);
  assert.match(patientProfile, /VIEW_APPOINTMENTS/);
  assert.match(patientProfile, /VIEW_REPORTS/);
  assert.match(patientProfile, /VIEW_HEALTH_TIMELINE/);
});
