const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('Phase 7 — Doctor Workstation provides Journey Progress monitoring tab and component', () => {
  const dashboardSrc = source(path.join('src', 'pages', 'DoctorDashboard.tsx'));
  const componentSrc = source(path.join('src', 'components', 'DoctorJourneyProgress.tsx'));
  const clientSrc = source(path.join('src', 'api', 'client.ts'));
  const typesSrc = source(path.join('src', 'api', 'types.ts'));

  // 1. DoctorDashboard integration
  assert.match(dashboardSrc, /import \{ DoctorJourneyProgress \} from '\.\.\/components\/DoctorJourneyProgress'/);
  assert.match(dashboardSrc, /'JOURNEY_PROGRESS'/);
  assert.match(dashboardSrc, /Journey & Insights/);
  assert.match(dashboardSrc, /<DoctorJourneyProgress\s+patientId=\{selectedPatient\.patientId\}/);

  // 2. DoctorJourneyProgress component features
  assert.match(componentSrc, /Care Journey Navigator/);
  assert.match(componentSrc, /GLYCEMIC CONTROL \(30D\)/);
  assert.match(componentSrc, /MEDICATION ADHERENCE/);
  assert.match(componentSrc, /CARE PLAN TASKS/);
  assert.match(componentSrc, /FOLLOW-UP APPOINTMENT/);
  assert.match(componentSrc, /Data Attribution Legend/);
  assert.match(componentSrc, /Calculated Health Insights & Observations/);
  assert.match(componentSrc, /Consultation Discussion Point/);
  assert.match(componentSrc, /Patient Journey Milestones/);
  assert.match(componentSrc, /Clinical Interpretation Notice/);

  // 3. API client methods
  assert.match(clientSrc, /export async function getPatientJourneySummary/);
  assert.match(clientSrc, /export async function getPatientJourneyInsights/);
  assert.match(clientSrc, /export async function getPatientJourneyMilestones/);

  // 4. API types definitions
  assert.match(typesSrc, /JourneyProgressSummary/);
  assert.match(typesSrc, /HealthInsight/);
  assert.match(typesSrc, /JourneyMilestoneItem/);
});
