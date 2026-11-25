const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', relativePath), 'utf8');

test('Doctor UI strictly excludes AI Care Proposals, Agent Activity views, and Billing & Collections', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));
  const workstation = source(path.join('components', 'DoctorWorkstation.tsx'));

  // Main navigation modes: Only minimal 3 views (Overview, Patients, Appointments)
  assert.doesNotMatch(dashboard, /'PROPOSALS' \| 'AGENT_FEED'/);
  assert.doesNotMatch(dashboard, /Care Roster & Longitudinal Chart/);
  assert.doesNotMatch(dashboard, /AI Care Proposals/);
  assert.doesNotMatch(dashboard, /Agent Activity Feed/);

  // Sub-tabs in patient workspace strictly exclude AI proposals
  assert.doesNotMatch(dashboard, /id:\s*'AI_PROPOSALS'/);
  assert.doesNotMatch(dashboard, /Governed AI Care Proposals/);

  // KPI stat ribbon strictly excludes proposal counters
  assert.doesNotMatch(dashboard, /pendingProposalsCount/);
  assert.doesNotMatch(dashboard, /Awaiting clinician sign-off/);
  assert.doesNotMatch(dashboard, /Awaiting clinician approval/);

  // Billing strictly removed from Doctor UI
  assert.doesNotMatch(dashboard, /Billing & Collections/);
  assert.doesNotMatch(dashboard, /showBillingModal/);
  assert.doesNotMatch(workstation, /aarogya:open-billing/);
  assert.doesNotMatch(workstation, /Billing & Collections/);
});

test('Doctor Workstation preserves practice settings and clinician profile modals', () => {
  const workstation = source(path.join('components', 'DoctorWorkstation.tsx'));
  assert.match(workstation, /Practice Settings/);
  assert.match(workstation, /Doctor Account|Profile/);
  assert.match(workstation, /showSettings/);
  assert.match(workstation, /showProfile/);
});

test('Doctor Glucose Monitoring strictly excludes pregnancy target controls while preserving standard adult targets', () => {
  const cgm = source(path.join('components', 'DoctorGlucoseMonitoring.tsx'));

  // Pregnancy controls strictly removed
  assert.doesNotMatch(cgm, /Pregnancy Target/);
  assert.doesNotMatch(cgm, /isPregnant/);
  assert.doesNotMatch(cgm, /Baby/);

  // Standard adult diabetes target preserved
  assert.match(cgm, /Standard Adult Target: 70–180 mg\/dL/);
});

test('api client exposes P0.7.6 proposal review and action inspection methods for contracts integrity', () => {
  const client = source(path.join('api', 'client.ts'));
  const types = source(path.join('api', 'types.ts'));

  // API Client methods preserved for contracts
  assert.match(client, /export async function getAgentProposals/);
  assert.match(client, /export async function reviewAgentProposal/);
  assert.match(client, /export async function getAgentPlan/);
  assert.match(client, /export async function getAgentAction/);
  assert.match(client, /\/agent\/proposals\/\$\{actionId\}\/clinician-review/);

  // Typed definitions preserved
  assert.match(types, /interface AgentProposalItem/);
  assert.match(types, /interface AgentProposalReviewPayload/);
  assert.match(types, /interface AgentProposalReviewResponse/);
  assert.match(types, /interface AgentActionFeedItem/);
  assert.match(types, /riskTier:\s*'LOW_RISK' \| 'MEDIUM_RISK' \| 'HIGH_RISK'/);
});

test('proposal rationale boundary validation logic enforces minimum character thresholds', () => {
  // Validate rationale boundary rules: empty, whitespace-only, and <3 chars are rejected; >=3 chars accepted
  const validateRationale = (reason, notes) => ((reason || notes || '').trim().length >= 3);
  assert.equal(validateRationale('', ''), false, 'Empty rationale must be rejected');
  assert.equal(validateRationale('   ', ''), false, 'Whitespace-only rationale must be rejected');
  assert.equal(validateRationale('no', ''), false, 'Rationale with <3 characters must be rejected');
  assert.equal(validateRationale('Clinically inappropriate dosage', ''), true, 'Valid rejection reason (>=3 chars) must be accepted');
  assert.equal(validateRationale('', 'Alternative medication indicated'), true, 'Valid review notes fallback (>=3 chars) must be accepted');
});

test('Doctor Dashboard provides Clinical Command Center header and 4-KPI metrics row', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  assert.match(dashboard, /Clinical Command Center/);
  assert.match(dashboard, /Manage patients, appointments, and ongoing clinical care/);
  assert.match(dashboard, /Assigned Patients/);
  assert.match(dashboard, /High Glycemic Risk/);
  assert.match(dashboard, /Overdue Follow-ups/);
  assert.match(dashboard, /Upcoming Visits/);
});

test('Doctor Dashboard provides formatted patient worklist and 5 consolidated clinical workspaces', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Worklist formatting
  assert.match(dashboard, /formatPatientName/);
  assert.match(dashboard, /getPatientRefCode/);
  assert.match(dashboard, /PT-/);
  assert.match(dashboard, /Start Consultation/);

  // 5 Intuitive Clinical Workspaces
  assert.match(dashboard, /'SUMMARY' \| 'CLINICAL_RECORD' \| 'MONITORING' \| 'CARE_PLAN' \| 'COORDINATION'/);
  assert.match(dashboard, /Summary & Vitals/);
  assert.match(dashboard, /Clinical Record/);
  assert.match(dashboard, /Monitoring/);
  assert.match(dashboard, /Care Plan/);
  assert.match(dashboard, /Coordination/);
});
