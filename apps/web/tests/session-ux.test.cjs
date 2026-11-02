const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) => fs.readFileSync(
  path.join(__dirname, '..', 'src', relativePath),
  'utf8',
);

test('Doctor Login form starts empty without demo patient/caregiver credentials', () => {
  const authPage = source(path.join('pages', 'Auth.tsx'));

  // Fields must start empty in React state
  assert.match(authPage, /const\s+\[email,\s*setEmail\]\s*=\s*useState\(''\)/);
  assert.match(authPage, /const\s+\[password,\s*setPassword\]\s*=\s*useState\(''\)/);

  // Must not contain any default patient or caregiver demo emails or credentials
  assert.doesNotMatch(authPage, /demo\.patient1@aarogyadamu\.local/i);
  assert.doesNotMatch(authPage, /meera\.joshi/i);
  assert.doesNotMatch(authPage, /DemoPassword123!/);

  // Inputs must use distinct doctor field names and autocomplete
  assert.match(authPage, /name="doctor-email"/);
  assert.match(authPage, /name="doctor-password"/);
  assert.match(authPage, /placeholder="doctor@hospital\.org"/);

  // Doctor registration must strictly require invitation token
  assert.match(authPage, /!invitationToken\.trim\(\)/);
  assert.match(authPage, /A valid doctor invitation is required to register\./);
});

test('Session expired notification is displayed on Doctor Login and cleared on user interaction', () => {
  const authPage = source(path.join('pages', 'Auth.tsx'));
  const authContext = source(path.join('context', 'AuthContext.tsx'));

  // AuthContext provides sessionNotice and clearSessionNotice
  assert.match(authContext, /sessionNotice:\s*string\s*\|\s*null/);
  assert.match(authContext, /clearSessionNotice:\s*\(\)\s*=>\s*void/);

  // AuthContext handles session_expired event, sets notice, and redirects to /login
  assert.match(authContext, /aarogyadamu:session_expired/);
  assert.match(authContext, /setSessionNotice\(notice\)/);
  assert.match(authContext, /window\.history\.replaceState\(null,\s*'',\s*'\/login'\)/);

  // AuthPage renders sessionNotice banner with dismiss button
  assert.match(authPage, /sessionNotice\s*&&\s*!error/);
  assert.match(authPage, /clearSessionNotice/);
});

test('Client distinguishes network errors from confirmed expired sessions and prevents infinite retries', () => {
  const apiClient = source(path.join('api', 'client.ts'));
  const doctorDashboard = source(path.join('pages', 'DoctorDashboard.tsx'));

  // refreshAccessToken must distinguish network error (throws) from 401 (returns null and dispatches event)
  assert.match(apiClient, /response\.status === 401 \|\| response\.status === 403/);
  assert.match(apiClient, /response\.status === 400/);
  assert.match(apiClient, /catch\s*\(\s*error\s*\)\s*\{\s*\/\/[^\n]*\n\s*throw error;/);

  // apiFetch only retries once and handles offline dispatch
  assert.match(apiClient, /if\s*\(refreshedToken\)/);
  assert.match(apiClient, /aarogyadamu:offline/);

  // DoctorDashboard must not show a retryable workspace error card for 401 session expiration
  assert.match(doctorDashboard, /if\s*\(err\s*instanceof\s*ApiError\s*&&\s*err\.status\s*===\s*401\)/);
  assert.match(doctorDashboard, /Unable to Connect to Workspace/);
});

test('Logout accurately reports server revocation status and clears local state immediately', () => {
  const authContext = source(path.join('context', 'AuthContext.tsx'));

  // Logout clears local state immediately
  assert.match(authContext, /clearSessionData\(\)/);
  assert.match(authContext, /setToken\(null\)/);
  assert.match(authContext, /setUser\(null\)/);

  // If server revocation fails, sets clear warning notice and throws error
  assert.match(authContext, /You are signed out on this device, but the server could not confirm session revocation\./);
});

