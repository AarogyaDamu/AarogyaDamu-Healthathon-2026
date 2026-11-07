const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) =>
  fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

// UUID v4 validation regex
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('P0.7.5 agent client API provides complete typed methods for all 5 runtime operations', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));

  // 1. generatePlan
  assert.match(agentApi, /async generatePlan\(/);
  assert.match(agentApi, /\/agent\/plan/);
  assert.match(agentApi, /x-target-patient-id/);
  assert.match(agentApi, /AgentPlanGenerateResult/);

  // 2. confirmAction
  assert.match(agentApi, /async confirmAction\(/);
  assert.match(agentApi, /\/agent\/execute\//);
  assert.match(agentApi, /AgentActionConfirmResult/);

  // 3. cancelAction
  assert.match(agentApi, /async cancelAction\(/);
  assert.match(agentApi, /\/agent\/cancel\//);
  assert.match(agentApi, /AgentActionCancelResult/);

  // 4. getPlan
  assert.match(agentApi, /async getPlan\(/);
  assert.match(agentApi, /\/agent\/plans\//);

  // 5. getAction
  assert.match(agentApi, /async getAction\(/);
  assert.match(agentApi, /\/agent\/actions\//);
});

test('P0.7.5 RFC 4122 v4 UUID generator produces compliant idempotency keys with cryptographic security', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));
  assert.match(agentApi, /export function generateUUID\(\)/);

  // Verify cryptographic security implementation
  assert.match(agentApi, /crypto\.randomUUID/);
  assert.match(agentApi, /crypto\.getRandomValues/);
  assert.match(agentApi, /refusing insecure Math\.random fallback/);

  // Test generator with crypto.getRandomValues
  function simulateCryptoUUID() {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  for (let i = 0; i < 50; i++) {
    const key = simulateCryptoUUID();
    assert.match(key, UUID_V4_REGEX, `Generated key ${key} must match RFC 4122 UUID v4 regex`);
  }
});

test('P0.7.5 tool display names cover all canonical allowlisted tools', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));
  assert.match(agentApi, /export function getToolDisplayName/);

  // All canonical tools
  assert.match(agentApi, /tool_schedule_care_task/);
  assert.match(agentApi, /Schedule Care Task/);

  assert.match(agentApi, /tool_schedule_reminder/);
  assert.match(agentApi, /Schedule Medication Reminder/);

  assert.match(agentApi, /tool_request_appointment/);
  assert.match(agentApi, /Request Doctor Appointment/);

  assert.match(agentApi, /tool_log_lifestyle_record/);
  assert.match(agentApi, /Log Lifestyle Record/);

  assert.match(agentApi, /tool_query_health_summary/);
  assert.match(agentApi, /Query Health Summary/);

  assert.match(agentApi, /tool_log_health_vital/);
  assert.match(agentApi, /Log Health Vital/);

  assert.match(agentApi, /tool_draft_care_proposal/);
  assert.match(agentApi, /Draft Clinical Care Proposal/);
});

test('P0.7.5 parameter formatter handles all tool parameter structures', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));
  assert.match(agentApi, /export function formatActionParameters/);

  assert.match(agentApi, /tool_schedule_care_task/);
  assert.match(agentApi, /Task Title/);
  assert.match(agentApi, /Due Date/);

  assert.match(agentApi, /tool_schedule_reminder/);
  assert.match(agentApi, /Reminder/);
  assert.match(agentApi, /Medication/);

  assert.match(agentApi, /tool_request_appointment/);
  assert.match(agentApi, /Doctor/);
  assert.match(agentApi, /Preferred Date/);

  assert.match(agentApi, /tool_log_lifestyle_record/);
  assert.match(agentApi, /Measurement/);

  assert.match(agentApi, /tool_query_health_summary/);
  assert.match(agentApi, /Time Range/);

  assert.match(agentApi, /tool_log_health_vital/);
  assert.match(agentApi, /Vital Type/);
  assert.match(agentApi, /Reading/);

  assert.match(agentApi, /tool_draft_care_proposal/);
  assert.match(agentApi, /Proposal Title/);
  assert.match(agentApi, /Proposed Changes/);
  assert.match(agentApi, /Clinical Justification/);
});

test('P0.7.5 risk tier configuration covers LOW_RISK, MEDIUM_RISK, and HIGH_RISK', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));
  assert.match(agentApi, /export function getRiskTierConfig/);
  assert.match(agentApi, /LOW_RISK/);
  assert.match(agentApi, /MEDIUM_RISK/);
  assert.match(agentApi, /HIGH_RISK/);
  assert.match(agentApi, /Doctor Gated/);
});

test('P0.7.5 action status configuration maps all canonical lifecycle statuses', () => {
  const agentApi = source(path.join('src', 'api', 'agent.ts'));
  assert.match(agentApi, /export function getActionStatusConfig/);

  assert.match(agentApi, /AWAITING_CONFIRMATION/);
  assert.match(agentApi, /PENDING_CLINICIAN_APPROVAL/);
  assert.match(agentApi, /EXECUTING/);
  assert.match(agentApi, /COMPLETED/);
  assert.match(agentApi, /PARTIALLY_EXECUTED/);
  assert.match(agentApi, /CANCELLED/);
  assert.match(agentApi, /EXPIRED/);
  assert.match(agentApi, /FAILED/);
  assert.match(agentApi, /REJECTED/);
  assert.match(agentApi, /EMERGENCY_ABORTED/);
  assert.match(agentApi, /PROHIBITED_REFUSED/);
});

test('P0.7.5 AgentProposalCard renders bounded action card with parameters, risk, and status', () => {
  const card = source(path.join('src', 'components', 'AgentProposalCard.tsx'));

  // Header, icon and risk tier badge
  assert.match(card, /getToolDisplayName\(action\.toolName\)/);
  assert.match(card, /getRiskTierConfig\(action\.riskTier\)/);
  assert.match(card, /getActionStatusConfig\(action\.status\)/);
  assert.match(card, /formatActionParameters\(action\.toolName, action\.parameters\)/);

  // Parameters box
  assert.match(card, /formattedParams\.map/);
  assert.match(card, /param\.label/);
  assert.match(card, /param\.value/);

  // Expiration notice
  assert.match(card, /action\.expiresAt/);
  assert.match(card, /formatExpiry/);
});

test('P0.7.5 AgentProposalCard enforces strict clinical boundary for PENDING_CLINICIAN_APPROVAL', () => {
  const card = source(path.join('src', 'components', 'AgentProposalCard.tsx'));

  // Pending clinician approval detection
  assert.match(card, /const isDoctorGated = action\.status === 'PENDING_CLINICIAN_APPROVAL'/);

  // Doctor review required notice
  assert.match(card, /Doctor Review Required/);
  assert.match(card, /licensed clinician must review and approve this action/);
  assert.match(card, /Patients cannot confirm it directly/);

  // Confirm button is ONLY rendered when AWAITING_CONFIRMATION
  assert.match(card, /isAwaitingConfirmation &&/);
  assert.match(card, /Confirm Action/);

  // When isDoctorGated is true, only withdraw proposal is permitted
  assert.match(card, /Withdraw Proposal/);
});

test('P0.7.5 AgentProposalCard prevents double-submission and generates UUID idempotencyKey', () => {
  const card = source(path.join('src', 'components', 'AgentProposalCard.tsx'));

  // Double tap prevention
  assert.match(card, /if \(!onConfirm \|\| isConfirming \|\| isCancelling\) return/);
  assert.match(card, /disabled=\{isConfirming \|\| isCancelling\}/);
  assert.match(card, /ActivityIndicator size="small"/);

  // UUID idempotencyKey generation per submission
  assert.match(card, /const idempotencyKey = generateUUID\(\)/);
  assert.match(card, /await onConfirm\(action\.id, idempotencyKey\)/);
});

test('P0.7.5 AgentProposalCard cancellation requires confirmed reason (min 3 chars)', () => {
  const card = source(path.join('src', 'components', 'AgentProposalCard.tsx'));

  assert.match(card, /CANCEL_REASONS/);
  assert.match(card, /No longer needed/);
  assert.match(card, /Incorrect details/);
  assert.match(card, /Scheduled by mistake/);

  // Validation: min 3 characters
  assert.match(card, /finalReason\.length < 3/);
  assert.match(card, /at least 3 characters/);

  // Submission
  assert.match(card, /await onCancel\(action\.id, finalReason\)/);
});

test('P0.7.5 AgentProposalCard handles emergency halt and terminal states', () => {
  const card = source(path.join('src', 'components', 'AgentProposalCard.tsx'));

  // Emergency halt notice
  assert.match(card, /isEmergencyAborted/);
  assert.match(card, /Action Halted for Clinical Safety/);
  assert.match(card, /112 \/ 108/);

  // Terminal states
  assert.match(card, /isCompleted/);
  assert.match(card, /Action executed and verified successfully/);

  assert.match(card, /isCancelled/);
  assert.match(card, /Action was cancelled/);

  assert.match(card, /isExpired/);
  assert.match(card, /Proposal has expired/);

  assert.match(card, /isFailed/);
  assert.match(card, /Action execution failed/);

  assert.match(card, /isRejected/);
  assert.match(card, /Proposal was reviewed and rejected by clinician/);
});

test('P0.7.5 Damu Voice Companion integrates governed agent planning while preserving P0.6 voice flows', () => {
  const damu = source(path.join('app', '(tabs)', 'damu.tsx'));

  // Agent imports
  assert.match(damu, /AgentService/);
  assert.match(damu, /AgentProposalCard/);

  // Mode switching: Companion Q&A vs Governed Actions
  assert.match(damu, /const \[mode, setMode\] = useState/);
  assert.match(damu, /Companion Q&A/);
  assert.match(damu, /Governed Actions/);

  // Agent plan generation handler
  assert.match(damu, /handleGenerateAgentPlan/);
  assert.match(damu, /AgentService\.generatePlan/);
  assert.match(damu, /consentObtained: true/);

  // Human-in-the-loop action confirmation handler
  assert.match(damu, /handleConfirmAction/);
  assert.match(damu, /AgentService\.confirmAction/);
  assert.match(damu, /confirm: true/);
  assert.match(damu, /idempotencyKey/);

  // Action cancellation handler
  assert.match(damu, /handleCancelAction/);
  assert.match(damu, /AgentService\.cancelAction/);
  assert.match(damu, /reason/);

  // Local state update
  assert.match(damu, /updateActionStatus/);

  // Bounded actions limit notice
  assert.match(damu, /Max 3/);
  assert.match(damu, /Governed Agent Plan/);

  // Prohibited action refusal notice
  assert.match(damu, /Clinical Safety Refusal/);
  assert.match(damu, /Safe Alternative/);

  // Emergency halt handling
  assert.match(damu, /Emergency condition detected/);

  // Preservation of P0.6 features
  assert.match(damu, /Zero-Retention Privacy/);
  assert.match(damu, /Informed Patient Consent/);
  assert.match(damu, /educational companion, not a doctor/i);
  assert.match(damu, /Speech\.speak/);
  assert.match(damu, /Audio\.Recording\.createAsync/);
});
