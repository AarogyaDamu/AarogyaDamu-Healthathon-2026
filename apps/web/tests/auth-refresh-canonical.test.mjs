import assert from 'node:assert/strict';
import test from 'node:test';

test('resolveApiBaseUrl canonical URL normalization', async () => {
  const { resolveApiBaseUrl } = await import('../src/api/client.ts');

  // URL without /api gets /api appended
  assert.equal(
    resolveApiBaseUrl('https://aarogyadamu-api.onrender.com'),
    'https://aarogyadamu-api.onrender.com/api'
  );

  // URL with /api is preserved
  assert.equal(
    resolveApiBaseUrl('https://aarogyadamu-api.onrender.com/api'),
    'https://aarogyadamu-api.onrender.com/api'
  );

  // Trailing slash is stripped and /api is preserved/appended
  assert.equal(
    resolveApiBaseUrl('https://aarogyadamu-api.onrender.com/api/'),
    'https://aarogyadamu-api.onrender.com/api'
  );
  assert.equal(
    resolveApiBaseUrl('https://aarogyadamu-api.onrender.com/'),
    'https://aarogyadamu-api.onrender.com/api'
  );
});

test('Unauthenticated initial page load does not call refreshAccessToken and does not dispatch session_expired', async () => {
  // Clear any existing global state
  global.window = {
    dispatchEvent: () => {},
    location: { pathname: '/login' },
  };
  global.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  global.document = {
    cookie: '',
  };
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  global.sessionStorage = {
    getItem: (k) => storage.get(`sess_${k}`) ?? null,
    setItem: (k, v) => storage.set(`sess_${k}`, String(v)),
    removeItem: (k) => storage.delete(`sess_${k}`),
    clear: () => {},
  };

  let fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    };
  };

  const client = await import('../src/api/client.ts');
  client.clearAuthToken();

  assert.equal(client.hasExistingSession(), false, 'Should report no existing session on fresh unauthenticated load');

  const refreshed = await client.refreshAccessToken();
  assert.equal(refreshed, null, 'refreshAccessToken should return null immediately without session');
  assert.equal(fetchCalls.length, 0, 'No network fetch should be dispatched when there is no existing session');
});

test('Authenticated session calls canonical endpoint /api/auth/refresh and handles rotation', async () => {
  let dispatchedEvents = [];
  global.window = {
    dispatchEvent: (evt) => { dispatchedEvents.push(evt); },
    location: { pathname: '/dashboard' },
  };
  global.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  let cookieVal = 'aarogyadamu_csrf_token=test-csrf-token';
  global.document = {
    get cookie() { return cookieVal; },
    set cookie(val) {
      if (val.includes('Max-Age=0') || val.includes('expires=')) {
        cookieVal = '';
      } else {
        cookieVal = val;
      }
    },
  };
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  global.sessionStorage = {
    getItem: (k) => storage.get(`sess_${k}`) ?? null,
    setItem: (k, v) => storage.set(`sess_${k}`, String(v)),
    removeItem: (k) => storage.delete(`sess_${k}`),
    clear: () => {},
  };

  let fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'x-csrf-token': 'new-csrf-token-123' }),
      json: async () => ({
        token: 'new-valid-jwt-token',
        refreshToken: 'new-rotated-refresh-token',
        csrfToken: 'new-csrf-token-123',
      }),
    };
  };

  const client = await import('../src/api/client.ts');
  // Simulate previous login session
  client.setAuthSession('old-jwt-token', 'old-refresh-token', 'test-csrf-token');
  assert.equal(client.hasExistingSession(), true);

  const newToken = await client.refreshAccessToken();
  assert.equal(newToken, 'new-valid-jwt-token');
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /\/api\/auth\/refresh$/, 'Must call canonical /api/auth/refresh endpoint');
  assert.equal(fetchCalls[0].options.credentials, 'include', 'Must include credentials for cookie delivery');
  assert.equal(fetchCalls[0].options.headers['X-CSRF-Token'], 'test-csrf-token', 'Must include CSRF token header');
});

test('Expired active session dispatches session_expired and stops subsequent refreshes', async () => {
  let dispatchedEvents = [];
  global.window = {
    dispatchEvent: (evt) => { dispatchedEvents.push(evt); },
    location: { pathname: '/dashboard' },
  };
  global.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  let cookieVal = 'aarogyadamu_csrf_token=test-csrf-token';
  global.document = {
    get cookie() { return cookieVal; },
    set cookie(val) {
      if (val.includes('Max-Age=0') || val.includes('expires=')) {
        cookieVal = '';
      } else {
        cookieVal = val;
      }
    },
  };
  const storage = new Map();
  global.localStorage = {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };
  global.sessionStorage = {
    getItem: (k) => storage.get(`sess_${k}`) ?? null,
    setItem: (k, v) => storage.set(`sess_${k}`, String(v)),
    removeItem: (k) => storage.delete(`sess_${k}`),
    clear: () => {},
  };

  let fetchCalls = [];
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url: String(url), options });
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Refresh session is invalid, expired, or revoked. Please sign in again.' }),
    };
  };

  const client = await import('../src/api/client.ts');
  client.setAuthSession('old-jwt-token', 'old-refresh-token', 'test-csrf-token');

  const result = await client.refreshAccessToken();
  assert.equal(result, null);
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, 'aarogyadamu:session_expired');
  assert.equal(client.hasExistingSession(), false, 'Session must be cleared on 401');

  // Subsequent call must NOT fire network fetch
  const secondAttempt = await client.refreshAccessToken();
  assert.equal(secondAttempt, null);
  assert.equal(fetchCalls.length, 1, 'Subsequent call must not make an additional network request');
});
