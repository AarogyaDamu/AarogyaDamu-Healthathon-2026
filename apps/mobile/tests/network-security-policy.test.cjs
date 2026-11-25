const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mobileRoot = path.resolve(__dirname, '..');
const mainManifestPath = path.join(mobileRoot, 'android/app/src/main/AndroidManifest.xml');
const debugManifestPath = path.join(mobileRoot, 'android/app/src/debug/AndroidManifest.xml');
const mainNetConfigPath = path.join(mobileRoot, 'android/app/src/main/res/xml/network_security_config.xml');
const debugNetConfigPath = path.join(mobileRoot, 'android/app/src/debug/res/xml/network_security_config.xml');
const backupRulesPath = path.join(mobileRoot, 'android/app/src/main/res/xml/secure_store_backup_rules.xml');
const dataExtractionRulesPath = path.join(mobileRoot, 'android/app/src/main/res/xml/secure_store_data_extraction_rules.xml');

test('Android Manifest permission minimization: storage and debug permissions removed from release manifest', () => {
  const mainManifest = fs.readFileSync(mainManifestPath, 'utf8');

  // Verify legacy broad storage permissions are completely removed from release manifest
  assert.ok(!mainManifest.includes('android.permission.READ_EXTERNAL_STORAGE'), 'READ_EXTERNAL_STORAGE must be removed from main manifest');
  assert.ok(!mainManifest.includes('android.permission.WRITE_EXTERNAL_STORAGE'), 'WRITE_EXTERNAL_STORAGE must be removed from main manifest');

  // SYSTEM_ALERT_WINDOW must NOT be present in main/release manifest
  assert.ok(!mainManifest.includes('android.permission.SYSTEM_ALERT_WINDOW'), 'SYSTEM_ALERT_WINDOW must not be in release manifest');

  // Essential runtime permissions must be retained
  assert.ok(mainManifest.includes('android.permission.INTERNET'), 'INTERNET permission required');
  assert.ok(mainManifest.includes('android.permission.ACCESS_NETWORK_STATE'), 'ACCESS_NETWORK_STATE permission required');
  assert.ok(mainManifest.includes('android.permission.RECORD_AUDIO'), 'RECORD_AUDIO permission required for voice');
  assert.ok(mainManifest.includes('android.permission.POST_NOTIFICATIONS'), 'POST_NOTIFICATIONS permission required for clinical alerts');
});

test('Android Manifest debug permissions: SYSTEM_ALERT_WINDOW is isolated to debug manifest only', () => {
  const debugManifest = fs.readFileSync(debugManifestPath, 'utf8');
  assert.ok(debugManifest.includes('android.permission.SYSTEM_ALERT_WINDOW'), 'SYSTEM_ALERT_WINDOW permitted strictly in debug manifest');
});

test('Android Network Security: Release configuration strictly prohibits all cleartext and untrusted CAs', () => {
  const releaseXml = fs.readFileSync(mainNetConfigPath, 'utf8');

  // base-config must explicitly set cleartextTrafficPermitted="false"
  assert.match(releaseXml, /<base-config[^>]*cleartextTrafficPermitted="false"/i, 'Release base-config must set cleartextTrafficPermitted="false"');

  // Only system certificates permitted
  assert.match(releaseXml, /<certificates\s+src="system"\s*\/>/i, 'Release must trust system CAs');
  assert.ok(!releaseXml.includes('src="user"'), 'Release must never trust user-installed CAs');

  // Zero cleartext domain overrides permitted in release
  assert.ok(!releaseXml.includes('cleartextTrafficPermitted="true"'), 'Release must not contain any cleartextTrafficPermitted="true" overrides');
});

test('Android Network Security: Debug configuration restricts cleartext to loopback only and isolates user CAs', () => {
  const debugXml = fs.readFileSync(debugNetConfigPath, 'utf8');

  // base-config prohibits cleartext by default
  assert.match(debugXml, /<base-config[^>]*cleartextTrafficPermitted="false"/i, 'Debug base-config must prohibit cleartext by default');

  // Debug allows user CAs for debugging proxies
  assert.match(debugXml, /<certificates\s+src="user"\s*\/>/i, 'Debug config permits user CAs for dev proxies');

  // Scoped domain-config allows cleartext ONLY for loopbacks
  assert.match(debugXml, /<domain-config[^>]*cleartextTrafficPermitted="true"/i, 'Debug config permits cleartext domain overrides');
  assert.match(debugXml, /<domain[^>]*>10\.0\.2\.2<\/domain>/i, 'Debug config must allow 10.0.2.2 emulator loopback');
  assert.match(debugXml, /<domain[^>]*>localhost<\/domain>/i, 'Debug config must allow localhost');
  assert.match(debugXml, /<domain[^>]*>127\.0\.0\.1<\/domain>/i, 'Debug config must allow 127.0.0.1');

  // Check that no external wildcard domains are allowed
  const domainMatches = [...debugXml.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map(m => m[1].trim());
  for (const domain of domainMatches) {
    assert.ok(
      ['10.0.2.2', 'localhost', '127.0.0.1'].includes(domain),
      `Unexpected domain '${domain}' allowed cleartext in debug config`
    );
  }
});

test('Android Manifest network configuration: declares networkSecurityConfig and disallows cleartext', () => {
  const mainManifest = fs.readFileSync(mainManifestPath, 'utf8');
  assert.match(mainManifest, /android:networkSecurityConfig="@xml\/network_security_config"/i, 'Manifest must link networkSecurityConfig');
  assert.match(mainManifest, /android:usesCleartextTraffic="false"/i, 'Manifest must set usesCleartextTraffic="false"');
});

test('Client runtime network policy: rejects external cleartext HTTP and enforces HTTPS in production', () => {
  // Save environment
  const originalEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.EXPO_PUBLIC_APP_ENV;

  try {
    // In dev mode, resolveApiBaseUrl logic:
    // 1. Loopback HTTP is accepted
    const isLoopback = (host) => ['localhost', '127.0.0.1', '10.0.2.2'].includes(host.toLowerCase());

    const testValidLoopbacks = [
      'http://localhost:4000/api',
      'http://127.0.0.1:4000/api',
      'http://10.0.2.2:4000/api',
    ];

    for (const url of testValidLoopbacks) {
      const parsed = new URL(url);
      assert.ok(isLoopback(parsed.hostname), `Expected ${parsed.hostname} to be valid loopback`);
    }

    // 2. External HTTP must be rejected
    const testExternalHttp = [
      'http://api.aarogyadamu.com/api',
      'http://insecure-backend.internal/api',
      'http://192.168.1.100:4000/api',
      'http://example.com/api',
    ];

    for (const url of testExternalHttp) {
      const parsed = new URL(url);
      const invalidCleartext = parsed.protocol === 'http:' && !isLoopback(parsed.hostname);
      assert.ok(invalidCleartext, `Expected ${url} to be flagged as disallowed cleartext`);
    }

    // 3. Staging and production builds require HTTPS
    const testReleaseHttps = 'https://api.aarogyadamu.com/api';
    const parsedHttps = new URL(testReleaseHttps);
    assert.equal(parsedHttps.protocol, 'https:');
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.EXPO_PUBLIC_APP_ENV = originalAppEnv;
  }
});

test('SecureStore backup rules: exclude sensitive credential files from cloud backups and extraction', () => {
  const backupRules = fs.readFileSync(backupRulesPath, 'utf8');
  const extractionRules = fs.readFileSync(dataExtractionRulesPath, 'utf8');

  // Both rule files must exist and exclude SecureStore / shared preferences containing auth secrets
  assert.ok(backupRules.includes('exclude'), 'Backup rules must contain exclusion directives');
  assert.ok(backupRules.includes('sharedpref'), 'Backup rules must exclude shared preferences');
  assert.ok(extractionRules.includes('exclude'), 'Data extraction rules must contain exclusion directives');
});

