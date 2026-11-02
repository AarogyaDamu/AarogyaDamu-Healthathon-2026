import assert from 'node:assert/strict';
import test from 'node:test';

test('Concurrent refresh single-flight protection: 5 simultaneous 401 requests trigger exactly 1 refresh and retry successfully', async () => {
  // Mock window and document
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
    cookie: 'aarogyadamu_csrf_token=mock-csrf-token',
  };
  global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  };

  let refreshCallCount = 0;
  let retriedRequestCount = 0;
  const initialExpiredToken = 'token_expired_abc';
  const freshToken = 'token_refreshed_xyz';

  // Import web client functions
  const client = await import('../src/api/client.ts');

  // Set initial session
  client.setAuthSession(initialExpiredToken);

  // Mock global.fetch
  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    // 1. Refresh endpoint
    if (urlStr.includes('/auth/refresh')) {
      refreshCallCount++;
      // Simulate network latency so concurrent requests overlap
      await new Promise((resolve) => setTimeout(resolve, 60));
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: freshToken, refreshToken: 'new-refresh-cookie-val' }),
      };
    }

    // 2. Data endpoints
    const authHeader = options.headers?.['Authorization'] || options.headers?.Authorization;

    // If using expired token, return 401
    if (authHeader === `Bearer ${initialExpiredToken}`) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: 'Session token expired or corrupted' }),
      };
    }

    // If using fresh token, succeed with 200
    if (authHeader === `Bearer ${freshToken}`) {
      retriedRequestCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, url: urlStr, retried: true }),
      };
    }

    return {
      ok: false,
      status: 403,
      json: async () => ({ error: 'Unexpected auth header' }),
    };
  };

  // Dispatch 5 concurrent requests simultaneously
  const endpoints = [
    '/coordination/doctor/dashboard',
    '/coordination/notifications',
    '/coordination/messages?patientId=p1',
    '/coordination/activity-feed?patientId=p1',
    '/profile/me',
  ];

  const results = await Promise.all(
    endpoints.map((ep) => client.apiFetch(ep))
  );

  // Assertions:
  // 1. All 5 requests succeeded
  assert.equal(results.length, 5);
  for (const res of results) {
    assert.equal(res.success, true);
    assert.equal(res.retried, true);
  }

  // 2. EXACTLY ONE refresh call was performed across all 5 concurrent requests
  assert.equal(refreshCallCount, 1, `Expected exactly 1 refresh operation, but got ${refreshCallCount}`);

  // 3. Exactly 5 retried requests succeeded with the fresh token
  assert.equal(retriedRequestCount, 5, `Expected 5 successful retried requests, but got ${retriedRequestCount}`);

  // 4. In-memory token is updated to the fresh token
  assert.equal(client.getAuthToken(), freshToken);
});
