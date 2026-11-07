const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', relativePath), 'utf8');

test('doctor dashboard provides P0.7.6 AI Care Proposals and Agent Activity views', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Main view selector modes
  assert.match(dashboard, /'ROSTER' \| 'PROPOSALS' \| 'AGENT_FEED'/);
  assert.match(dashboard, /Care Roster & Longitudinal Chart/);
  assert.match(dashboard, /AI Care Proposals/);
  assert.match(dashboard, /Agent Activity Feed/);

  // Sub-tab navigation in patient drawer
  assert.match(dashboard, /id:\s*'AI_PROPOSALS'/);
  assert.match(dashboard, /Governed AI Care Proposals/);

  // KPI stat ribbon integration
  assert.match(dashboard, /grid-cols-2 md:grid-cols-6/);
  assert.match(dashboard, /pendingProposalsCount/);
  assert.match(dashboard, /Awaiting clinician sign-off|Awaiting clinician approval/);
});

test('doctor dashboard enforces strict clinical governance and human-in-the-loop review', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Clinical safety governance notices
  assert.match(dashboard, /AarogyaDamu Clinical Governance Notice/);
  assert.match(dashboard, /PENDING_CLINICIAN_APPROVAL/);
  assert.match(dashboard, /AI agents NEVER autonomously modify patient care plans, alter medications, or adjust glycemic targets/);
  assert.match(dashboard, /AI-GENERATED PROPOSAL \(DECISION SUPPORT ONLY\)/);
  assert.match(dashboard, /RECORDED PATIENT FACTS \(EHR SOURCE OF TRUTH\)/);

  // No fabricated measurements rule
  assert.match(dashboard, /Clinical Fact Boundary/);
  assert.match(dashboard, /verified medical history recorded directly by the patient or clinical team/);
  assert.match(dashboard, /Damu does not alter, fabricate, or extrapolate clinical measurements/);

  // Fallback clinical target labeling (LOW-P0.7.6-05)
  assert.match(dashboard, /Reference Default — Not a Recorded Patient Target/);
});

test('api client exposes P0.7.6 proposal review and action inspection methods', () => {
  const client = source(path.join('api', 'client.ts'));
  const types = source(path.join('api', 'types.ts'));

  // API Client methods
  assert.match(client, /export async function getAgentProposals/);
  assert.match(client, /export async function reviewAgentProposal/);
  assert.match(client, /export async function getAgentPlan/);
  assert.match(client, /export async function getAgentAction/);
  assert.match(client, /\/agent\/proposals\/\$\{actionId\}\/clinician-review/);

  // Typed definitions
  assert.match(types, /interface AgentProposalItem/);
  assert.match(types, /interface AgentProposalReviewPayload/);
  assert.match(types, /interface AgentProposalReviewResponse/);
  assert.match(types, /interface AgentActionFeedItem/);
  assert.match(types, /riskTier:\s*'LOW_RISK' \| 'MEDIUM_RISK' \| 'HIGH_RISK'/);
});

test('doctor dashboard proposal approval requires explicit clinician confirmation and validates notes', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Explicit approval handler
  assert.match(dashboard, /handleApproveProposal/);
  assert.match(dashboard, /decision:\s*'APPROVE'/);
  assert.match(dashboard, /Approve Clinical Proposal/);

  // Validates review notes length if supplied (min 2 chars)
  assert.match(dashboard, /trimmedNotes && trimmedNotes\.length < 2/);
  assert.match(dashboard, /Clinical review notes must be at least 2 characters if provided/);

  // Accurate confirmation banner upon approved proposal (MED-P0.7.6-01)
  assert.match(dashboard, /AI clinical proposal approved/);
  assert.match(dashboard, /The advisory recommendation has been reviewed and approved by the assigned clinician/);
  assert.match(dashboard, /This approval does not automatically change the patient's care plan or prescription/);
  assert.match(dashboard, /Proposal Approved — Advisory Review Complete/);
  assert.match(dashboard, /Any actual care-plan, medication, dosage, or prescription change must be separately entered/);

  // Modal accessibility attributes on Proposal Detail modal (MED-P0.7.6-02)
  assert.match(dashboard, /role="dialog"/);
  assert.match(dashboard, /aria-modal="true"/);
  assert.match(dashboard, /aria-labelledby="proposal-modal-title"/);
  assert.match(dashboard, /aria-label="Close dialog"/);
});

test('doctor dashboard proposal rejection requires mandatory clinical rationale (min 3 chars)', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Rejection handler and modal
  assert.match(dashboard, /handleRejectProposal/);
  assert.match(dashboard, /decision:\s*'REJECT'/);
  assert.match(dashboard, /Confirm Proposal Rejection/);

  // Mandatory rejection reason validation (min 3 characters)
  assert.match(dashboard, /!trimmedReason \|\| trimmedReason\.length < 3/);
  assert.match(dashboard, /Clinical rejection reason is required and must be at least 3 characters/);
  assert.match(dashboard, /disabled=\{submittingProposalReview \|\| proposalRejectionReason\.trim\(\)\.length < 3\}/);

  // Confirmation of rejection recorded
  assert.match(dashboard, /Clinical proposal rejected/);
  assert.match(dashboard, /Clinical rationale has been recorded in the permanent audit trail/);

  // Modal accessibility attributes on Rejection modal (MED-P0.7.6-02)
  assert.match(dashboard, /aria-labelledby="rejection-modal-title"/);
  assert.match(dashboard, /aria-describedby="rejection-modal-description"/);
  assert.match(dashboard, /aria-label="Cancel rejection and return to proposal"/);
});

test('doctor dashboard prevents duplicate review dispatch and handles conflicts', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Concurrency guardrail
  assert.match(dashboard, /submittingProposalReview/);
  assert.match(dashboard, /if \(submittingProposalReview\) return/);

  // Status check guardrail
  assert.match(dashboard, /if \(proposal\.status !== 'PENDING_CLINICIAN_APPROVAL'\)/);
  assert.match(dashboard, /Cannot approve: Proposal is currently in/);
  assert.match(dashboard, /Cannot reject: Proposal is currently in/);

  // Conflict / already-reviewed API error handling
  assert.match(dashboard, /INVALID_ACTION_FOR_CLINICIAN_REVIEW/);
  assert.match(dashboard, /Proposal has already been reviewed or is no longer awaiting clinician approval/);
});

test('doctor dashboard enforces active doctor-patient assignment and handles 403 access denial', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Scoped to active assignments
  assert.match(dashboard, /Filter Patient:/);
  assert.match(dashboard, /All Assigned Patients/);

  // Handles UNASSIGNED_CLINICIAN 403 error cleanly
  assert.match(dashboard, /UNASSIGNED_CLINICIAN/);
  assert.match(dashboard, /Access denied: You do not have an active clinician assignment for this patient/);
});

test('doctor dashboard handles feature flag disabled behavior gracefully', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Feature flag check and banner
  assert.match(dashboard, /isAgentFeatureDisabled/);
  assert.match(dashboard, /FEATURE_FLAG_DISABLED|FEATURE_DISABLED/);
  assert.match(dashboard, /Governed AI Agent execution is currently disabled by clinical safety policy/);
  assert.match(dashboard, /P0_7_AGENTIC_EXECUTION/);
});

test('doctor dashboard provides agent activity feed with tool risk tier classification and detail inspection', () => {
  const dashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // Feed section
  assert.match(dashboard, /Governed Agent Execution Activity Feed/);
  assert.match(dashboard, /action\.toolName/);
  assert.match(dashboard, /action\.riskTier/);
  assert.match(dashboard, /HIGH_RISK/);
  assert.match(dashboard, /MEDIUM_RISK/);
  assert.match(dashboard, /LOW_RISK/);

  // Action detail inspection
  assert.match(dashboard, /Inspect Action/);
  assert.match(dashboard, /selectedActionDetail/);
  assert.match(dashboard, /getAgentAction\(action\.id\)/);
});
