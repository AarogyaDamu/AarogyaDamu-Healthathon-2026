const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = (relativePath) => fs.readFileSync(
  path.join(__dirname, '..', relativePath),
  'utf8',
);

test('mobile onboarding leads to patient or caregiver role selection and auth', () => {
  const welcome = source(path.join('app', '(auth)', 'welcome.tsx'));
  const roles = source(path.join('app', '(auth)', 'role-selection.tsx'));
  const roleOptions = roles.match(/const ROLES: RoleOption\[\] = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(roleOptions);
  const roleIds = [...roleOptions.matchAll(/id:\s*'(PATIENT|CAREGIVER|DOCTOR)'/g)].map((match) => match[1]);

  assert.match(welcome, /setMobileOnboardingCompleted\(true\)/);
  assert.match(welcome, /router\.replace\('\/\(auth\)\/role-selection'\)/);
  assert.deepEqual(roleIds, ['PATIENT', 'CAREGIVER']);
  assert.match(roles, /setSelectedMobileRole\(selectedRole\)/);
  assert.match(roles, /pathname: '\/\(auth\)\/auth'/);
});

test('mobile auth supports both patient and caregiver login with role attribution', () => {
  const auth = source(path.join('app', '(auth)', 'auth.tsx'));
  assert.match(auth, /type SelectedMobileRole = 'PATIENT' \| 'CAREGIVER'/);
  assert.match(auth, /const path = isRegister \? '\/auth\/register' : '\/auth\/login'/);
  assert.match(auth, /role: selectedRole/);
  assert.match(auth, /await saveMobileToken\(result\.token, result\.refreshToken\)/);
  assert.match(auth, /await setSelectedMobileRole\(selectedRole\)/);
  assert.match(auth, /router\.replace\('\/session-router'\)/);
});

test('mobile session restoration uses refresh token rotation and handles expiration', () => {
  const client = source(path.join('src', 'api', 'client.ts'));
  const sessionRouter = source(path.join('app', 'session-router.tsx'));

  assert.match(client, /async function rotateMobileRefreshToken/);
  assert.match(client, /const refreshToken = await getMobileRefreshToken\(\)/);
  assert.match(client, /body: JSON\.stringify\(\{ refreshToken \}\)/);
  assert.match(client, /await saveMobileToken\(session\.token, session\.refreshToken\)/);
  assert.match(sessionRouter, /await coordinationApi\.getContext\(\)/);
  assert.match(sessionRouter, /await logoutMobileSession\(\)/);
});

test('mobile logout clears the token but preserves onboarding completion', () => {
  const client = source(path.join('src', 'api', 'client.ts'));
  const profile = source(path.join('app', '(tabs)', 'profile.tsx'));
  const tokenClear = client.match(/export async function clearMobileToken\(\)[\s\S]*?\n\}/)?.[0];

  assert.ok(tokenClear);
  assert.doesNotMatch(tokenClear, /ONBOARDING_KEY|setMobileOnboardingCompleted/);
  assert.match(profile, /await logoutMobileSession\(\)/);
  assert.match(client, /export async function logoutMobileSession/);
  assert.match(client, /\/auth\/logout/);
  assert.match(client, /REFRESH_TOKEN_KEY/);
  assert.match(client, /\/auth\/refresh/);
  assert.match(client, /rotateMobileRefreshToken/);
  assert.match(source(path.join('app', '(auth)', 'auth.tsx')), /saveMobileToken\(result\.token, result\.refreshToken\)/);
  assert.doesNotMatch(client.match(/export async function logoutMobileSession\(\)[\s\S]*?\n\}/)?.[0] ?? '', /ONBOARDING_KEY|setMobileOnboardingCompleted/);
  assert.match(client, /export async function getMobileOnboardingCompleted/);
  assert.match(client, /export async function setMobileOnboardingCompleted/);
});

test('authenticated mobile role routing contains only patient and caregiver destinations', () => {
  const router = source(path.join('app', 'session-router.tsx'));

  assert.match(router, /role === 'CAREGIVER'/);
  assert.match(router, /router\.replace\(routeForRole\(nextRole\)\)/);
  assert.doesNotMatch(router, /'\/\(doctor\)'|router\.replace\(['"]\/\(doctor\)/);
});

test('mobile preserves two-product architecture: doctor routes are excluded from mobile', () => {
  const router = source(path.join('app', 'session-router.tsx'));
  const welcome = source(path.join('app', '(auth)', 'welcome.tsx'));

  // Mobile navigation only leads to tabs (patient) or caregiver
  assert.doesNotMatch(router, /DoctorWorkstation|DoctorDashboard/);
  assert.doesNotMatch(welcome, /DOCTOR/);
});
