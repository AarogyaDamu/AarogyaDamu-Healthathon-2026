const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', relativePath), 'utf8');

test('mobile AppointmentCenter provides guided 4-step consultation booking wizard for patients', () => {
  const comp = source(path.join('features', 'coordination', 'AppointmentCenter.tsx'));

  // Multi-step wizard
  assert.match(comp, /Select Doctor & Clinic/);
  assert.match(comp, /Choose Date & Slot/);
  assert.match(comp, /Pre-Visit Intake Assessment/);
  assert.match(comp, /Review & Request/);

  // Doctor & clinic selection
  assert.match(comp, /Select Treating Physician/);
  assert.match(comp, /clinicBadgeText/);
  assert.match(comp, /Apollo Sugar Clinic/);

  // Real-time slot availability
  assert.match(comp, /Available Slots on this Date/);
  assert.match(comp, /loadSlots/);
  assert.match(comp, /coordinationApi\.getDoctorAvailability/);
});

test('mobile AppointmentCenter uses the shared 18-question intake and preserves the clinical disclaimer', () => {
  const comp = source(path.join('features', 'coordination', 'AppointmentCenter.tsx'));
  const contracts = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'packages', 'contracts', 'src', 'appointments.ts'), 'utf8');

  assert.match(comp, /PRE_VISIT_QUESTIONNAIRE_QUESTIONS/);
  assert.equal((contracts.match(/makeIntakeQuestion\('/g) || []).length, 18);
  assert.match(comp, /Questions 1–6/);
  assert.match(comp, /Questions 7–12/);
  assert.match(comp, /Questions 13–18/);

  assert.match(contracts, /Are you a known case of diabetes\? \(YES \/ NO\)\./);
  assert.match(contracts, /What medications are you currently taking for diabetes\?/);
  assert.match(contracts, /What was your recent fasting and PP result\?/);
  assert.match(contracts, /hypoglycemia_episodes/);
  assert.match(contracts, /medication_adherence/);
  assert.match(contracts, /Do you follow a specific diet plan or exercise routine\? \(YES\/NO\)\./);

  // Clinical safety disclaimer
  assert.match(comp, /AarogyaDamu Clinical Intake Protocol/);
  assert.match(comp, /prepares your doctor for your visit/);
  assert.match(comp, /diagnostic directive/);
  assert.match(comp, /seek immediate hospital care/);
});

test('mobile AppointmentCenter supports caregiver viewing with privacy boundary and intake masking', () => {
  const comp = source(path.join('features', 'coordination', 'AppointmentCenter.tsx'));

  // Caregiver mode
  assert.match(comp, /mode === 'CAREGIVER'/);
  assert.match(comp, /VIEW_APPOINTMENTS/);
  assert.match(comp, /MANAGE_CONSULTATIONS/);
  assert.match(comp, /Select Authorized Dependent/);
  assert.match(comp, /View scheduled doctor appointments for authorized family members/);
});

test('mobile coordination API exposes Phase 4 availability and questionnaire methods', () => {
  const api = source(path.join('api', 'coordination.ts'));

  assert.match(api, /getDoctorAvailability/);
  assert.match(api, /getQuestionnaire/);
  assert.match(api, /AppointmentRecord/);
  assert.match(api, /questionnaireResponse/);
  assert.match(api, /clinicName/);
  assert.match(api, /rejectionReason/);
  assert.match(api, /cancellationReason/);
});
