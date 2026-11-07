import assert from 'node:assert/strict';
import test from 'node:test';

// Setup DOM / Browser globals for Node test environment
global.window = {
  dispatchEvent: () => {},
  location: { pathname: '/dashboard' },
};
global.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
global.document = {
  cookie: 'aarogyadamu_csrf_token=test-csrf-token',
};
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

// Dynamically import the web client module
const client = await import('../src/api/client.ts');

test('P0.7.6 API Client: getAgentProposals sends properly scoped query and headers', async () => {
  client.setAuthToken('mock_doctor_token_123');

  let interceptedUrl = '';
  let interceptedHeaders = {};

  global.fetch = async (url, options = {}) => {
    interceptedUrl = String(url);
    interceptedHeaders = options.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        proposals: [
          {
            actionId: 'action-uuid-1',
            planId: 'plan-uuid-1',
            planVersion: 1,
            patientId: 'patient-uuid-1',
            toolName: 'tool_draft_care_proposal',
            riskTier: 'HIGH_RISK',
            status: 'PENDING_CLINICIAN_APPROVAL',
            parameters: {
              proposalType: 'MEDICATION_ADJUSTMENT_REQUEST',
              title: 'Metformin Dose Adjustment',
              rationale: 'Fasting glucose consistently elevated above 140 mg/dL',
            },
            explanation: 'Adjusting metformin dosage to achieve target glycemic control.',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    };
  };

  const res = await client.getAgentProposals({
    status: 'PENDING_CLINICIAN_APPROVAL',
    patientId: 'patient-uuid-1',
    limit: 50,
  });

  assert.ok(res.success);
  assert.equal(res.proposals.length, 1);
  assert.equal(res.proposals[0].toolName, 'tool_draft_care_proposal');
  assert.equal(res.proposals[0].riskTier, 'HIGH_RISK');
  assert.ok(interceptedUrl.includes('/agent/proposals'));
  assert.ok(interceptedUrl.includes('status=PENDING_CLINICIAN_APPROVAL'));
  assert.ok(interceptedUrl.includes('patientId=patient-uuid-1'));
  assert.ok(interceptedUrl.includes('limit=50'));
  assert.equal(interceptedHeaders['Authorization'], 'Bearer mock_doctor_token_123');
});

test('P0.7.6 API Client: getAgentProposals handles 403 UNASSIGNED_CLINICIAN for unassigned patient', async () => {
  client.setAuthToken('mock_doctor_token_123');

  global.fetch = async () => {
    return {
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        errorCode: 'UNASSIGNED_CLINICIAN',
        error: "Access denied: Clinician does not have an active assignment for patient 'unassigned-uuid'.",
      }),
    };
  };

  await assert.rejects(
    async () => {
      await client.getAgentProposals({ patientId: 'unassigned-uuid' });
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /UNASSIGNED_CLINICIAN|Access denied/);
      return true;
    }
  );
});

test('P0.7.6 API Client: reviewAgentProposal submits APPROVE decision with review notes', async () => {
  client.setAuthToken('mock_doctor_token_123');

  let interceptedMethod = '';
  let interceptedBody = null;

  global.fetch = async (url, options = {}) => {
    interceptedMethod = options.method || 'GET';
    interceptedBody = JSON.parse(options.body || '{}');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        actionId: 'action-uuid-1',
        status: 'COMPLETED',
        decision: 'APPROVE',
      }),
    };
  };

  const payload = {
    planId: 'plan-uuid-1',
    planVersion: 1,
    decision: 'APPROVE',
    clinicalReviewNotes: 'Approved after review of ambulatory blood glucose logs.',
  };

  const res = await client.reviewAgentProposal('action-uuid-1', payload);

  assert.ok(res.success);
  assert.equal(res.actionId, 'action-uuid-1');
  assert.equal(res.status, 'COMPLETED');
  assert.equal(res.decision, 'APPROVE');
  assert.equal(interceptedMethod, 'POST');
  assert.equal(interceptedBody.planId, 'plan-uuid-1');
  assert.equal(interceptedBody.decision, 'APPROVE');
  assert.equal(interceptedBody.clinicalReviewNotes, payload.clinicalReviewNotes);
});

test('P0.7.6 API Client: reviewAgentProposal submits REJECT decision with mandatory rationale', async () => {
  client.setAuthToken('mock_doctor_token_123');

  let interceptedMethod = '';
  let interceptedBody = null;

  global.fetch = async (url, options = {}) => {
    interceptedMethod = options.method || 'GET';
    interceptedBody = JSON.parse(options.body || '{}');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        actionId: 'action-uuid-1',
        status: 'REJECTED',
        decision: 'REJECT',
      }),
    };
  };

  const payload = {
    planId: 'plan-uuid-1',
    planVersion: 1,
    decision: 'REJECT',
    rejectionReason: 'Recent HbA1c of 8.2% indicates tighter glycemic control required; tapering insulin is unsafe.',
    clinicalReviewNotes: 'Rejected on clinical grounds.',
  };

  const res = await client.reviewAgentProposal('action-uuid-1', payload);

  assert.ok(res.success);
  assert.equal(res.actionId, 'action-uuid-1');
  assert.equal(res.status, 'REJECTED');
  assert.equal(res.decision, 'REJECT');
  assert.equal(interceptedMethod, 'POST');
  assert.equal(interceptedBody.decision, 'REJECT');
  assert.equal(interceptedBody.rejectionReason, payload.rejectionReason);
});

test('P0.7.6 API Client: reviewAgentProposal handles 400 conflict when action is not in PENDING_CLINICIAN_APPROVAL', async () => {
  client.setAuthToken('mock_doctor_token_123');

  global.fetch = async () => {
    return {
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        errorCode: 'INVALID_ACTION_FOR_CLINICIAN_REVIEW',
        error: "Action 'action-uuid-1' is not in PENDING_CLINICIAN_APPROVAL status. Found 'COMPLETED'.",
      }),
    };
  };

  await assert.rejects(
    async () => {
      await client.reviewAgentProposal('action-uuid-1', {
        planId: 'plan-uuid-1',
        decision: 'APPROVE',
      });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /INVALID_ACTION_FOR_CLINICIAN_REVIEW|not in PENDING_CLINICIAN_APPROVAL/);
      return true;
    }
  );
});

test('P0.7.6 API Client: handles 403 FEATURE_FLAG_DISABLED gracefully', async () => {
  client.setAuthToken('mock_doctor_token_123');

  global.fetch = async () => {
    return {
      ok: false,
      status: 403,
      json: async () => ({
        success: false,
        errorCode: 'FEATURE_FLAG_DISABLED',
        error: 'Feature flag P0_7_AGENTIC_EXECUTION is disabled.',
      }),
    };
  };

  await assert.rejects(
    async () => {
      await client.getAgentProposals();
    },
    (err) => {
      assert.equal(err.status, 403);
      assert.match(err.message, /FEATURE_FLAG_DISABLED|P0_7_AGENTIC_EXECUTION/);
      return true;
    }
  );
});

test('P0.7.6 API Client: getAgentAction and getAgentPlan retrieve individual details', async () => {
  client.setAuthToken('mock_doctor_token_123');

  global.fetch = async (url) => {
    const urlStr = String(url);
    if (urlStr.includes('/agent/actions/action-123')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          action: {
            id: 'action-123',
            planId: 'plan-123',
            toolName: 'tool_draft_care_proposal',
            riskTier: 'HIGH_RISK',
            status: 'PENDING_CLINICIAN_APPROVAL',
            parameters: { title: 'Test Proposal' },
            createdAt: new Date().toISOString(),
          },
        }),
      };
    }

    if (urlStr.includes('/agent/plans/plan-123')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          plan: {
            id: 'plan-123',
            version: 1,
            userIntent: 'Doctor review plan',
            targetPatientId: 'pt-123',
            status: 'PENDING_CLINICIAN_APPROVAL',
            createdAt: new Date().toISOString(),
            actions: [],
          },
        }),
      };
    }

    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  };

  const actionRes = await client.getAgentAction('action-123');
  assert.ok(actionRes.success);
  assert.equal(actionRes.action.id, 'action-123');
  assert.equal(actionRes.action.riskTier, 'HIGH_RISK');

  const planRes = await client.getAgentPlan('plan-123');
  assert.ok(planRes.success);
  assert.equal(planRes.plan.id, 'plan-123');
});
