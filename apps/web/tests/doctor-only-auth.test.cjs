const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) => fs.readFileSync(
  path.join(__dirname, '..', 'src', relativePath),
  'utf8',
);

test('unauthenticated web composition is doctor-only and excludes mobile shell routes', () => {
  const app = source('App.tsx');
  const authPage = source(path.join('pages', 'Auth.tsx'));

  assert.match(app, /return <AuthPage \/>/);
  assert.match(app, /!token \|\| !user\?\.isClinician/);
  assert.match(app, /<DoctorWorkstation/);
  assert.match(app, /window\.history\.replaceState\(null, '', '\/login'\)/);
  assert.doesNotMatch(app, /PatientSwitcher|CaregiverConnect|<Navbar|needsOnboarding/);
  assert.match(authPage, /Doctor Login/);
  assert.match(authPage, /Doctor Registration/);
  assert.doesNotMatch(authPage, /Patient demo|Caregiver demo|Clinical Onboarding Baseline|role-selection/i);
});

test('web authentication trusts the verified API doctor role and clears rejected sessions', () => {
  const authContext = source(path.join('context', 'AuthContext.tsx'));
  const apiClient = source(path.join('api', 'client.ts'));

  assert.ok(authContext.includes("apiFetch<MeResponse>('/auth/me')"));
  assert.match(authContext, /response\.user\?\.isClinician !== true/);
  assert.match(authContext, /verified\.user\?\.isClinician !== true/);
  assert.ok(authContext.includes("'/auth/doctor/register'"));
  assert.match(authContext, /clearAuthToken\(\)/);
  assert.match(authContext, /setActiveTargetPatientId\(null\)/);
  assert.match(authContext, /clearApiCache\(\)/);
  assert.ok(authContext.includes("apiFetch<{ success: boolean }>('/auth/logout'"));
  assert.match(apiClient, /REFRESH_TOKEN_KEY/);
  assert.match(apiClient, /\/auth\/refresh/);
  assert.match(apiClient, /setAuthSession/);
});

test('doctor workstation provides profile access and confirmed sign out', () => {
  const workstation = source(path.join('components', 'DoctorWorkstation.tsx'));

  assert.match(workstation, /aria-haspopup="menu"/);
  assert.match(workstation, /role="menuitem"[\s\S]*?Profile/);
  assert.match(workstation, /role="alertdialog"/);
  assert.match(workstation, /Sign Out/);
});
