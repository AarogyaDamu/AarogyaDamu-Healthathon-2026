const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', relativePath), 'utf8');

test('doctor dashboard provides Phase 4 Appointments & Clinical Visits view', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Main view selector modes includes APPOINTMENTS
  assert.match(dashboard, /'ROSTER' \| 'PROPOSALS' \| 'AGENT_FEED' \| 'APPOINTMENTS'/);
  assert.match(dashboard, /Appointments & Visits/);

  // Component integration
  assert.match(dashboard, /import DoctorAppointments from '\.\.\/components\/DoctorAppointments'/);
  assert.match(dashboard, /mainView === 'APPOINTMENTS'/);
  assert.match(dashboard, /<DoctorAppointments/);
});

test('doctor appointments component provides comprehensive visit management controls', () => {
  const comp = source(path.join('components', 'DoctorAppointments.tsx'));

  // Status badge handling
  assert.match(comp, /REQUESTED/);
  assert.match(comp, /CONFIRMED/);
  assert.match(comp, /RESCHEDULED/);
  assert.match(comp, /COMPLETED/);
  assert.match(comp, /DECLINED/);
  assert.match(comp, /CANCELLED/);
  assert.match(comp, /MISSED/);

  // Action controls
  assert.match(comp, /handleConfirm/);
  assert.match(comp, /handleDeclineSubmit/);
  assert.match(comp, /handleRescheduleSubmit/);
  assert.match(comp, /handleMarkMissed/);
  assert.match(comp, /Start consulting/);
  assert.doesNotMatch(comp, /Mark Completed|handleMarkCompleted/);

  // Modals for clinical reasons and rescheduling
  assert.match(comp, /Decline Appointment Request/);
  assert.match(comp, /Reschedule Appointment/);
  assert.match(comp, /Pre-Consultation Diabetes Intake Assessment/);
  assert.match(comp, /Practice Schedule & Availability Engine/);
});

test('doctor appointments component enforces clinical safety disclaimer on intake review', () => {
  const comp = source(path.join('components', 'DoctorAppointments.tsx'));

  assert.match(comp, /AarogyaDamu pre-consultation protocol/);
  assert.match(comp, /do not constitute a diagnostic directive/);
  assert.match(comp, /Clinical Attention/);
});

test('api client exposes Phase 4 appointment management and scheduling methods', () => {
  const client = source(path.join('api', 'client.ts'));
  const types = source(path.join('api', 'types.ts'));

  // API Client methods
  assert.match(client, /export async function getDoctorAppointments/);
  assert.match(client, /export async function updateAppointmentStatus/);
  assert.match(client, /export async function getDoctorAvailability/);
  assert.match(client, /export async function getDoctorScheduleSettings/);
  assert.match(client, /export async function updateDoctorScheduleSettings/);
  assert.match(client, /export async function createDoctorTimeOff/);
  assert.match(client, /export async function deleteDoctorTimeOff/);
  assert.match(client, /export async function getQuestionnaireDefinition/);

  // Types
  assert.match(types, /export type AppointmentStatus/);
  assert.match(types, /interface DoctorAppointmentItem/);
  assert.match(types, /interface DoctorAvailabilitySlot/);
  assert.match(types, /interface DoctorScheduleSetting/);
  assert.match(types, /interface DoctorTimeOffItem/);
});
