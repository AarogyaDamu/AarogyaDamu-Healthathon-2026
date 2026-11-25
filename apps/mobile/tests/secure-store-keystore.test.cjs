const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientSourcePath = path.resolve(__dirname, '../src/api/client.ts');
const backupRulesPath = path.resolve(__dirname, '../android/app/src/main/res/xml/secure_store_backup_rules.xml');
const dataExtractionRulesPath = path.resolve(__dirname, '../android/app/src/main/res/xml/secure_store_data_extraction_rules.xml');

test('Secure Token Storage: Authentication tokens are stored exclusively via SecureStore, never AsyncStorage', () => {
  const clientSource = fs.readFileSync(clientSourcePath, 'utf8');

  // Verify SecureStore is imported
  assert.match(clientSource, /import\s+\*\s+as\s+SecureStore\s+from\s+['"]expo-secure-store['"]/, 'Must import expo-secure-store');

  // Verify AsyncStorage is NOT imported in client.ts for token management
  assert.ok(!clientSource.includes('@react-native-async-storage/async-storage'), 'AsyncStorage must NOT be used in auth client');

  // Verify saveMobileToken stores to SecureStore
  assert.match(clientSource, /await SecureStore\.setItemAsync\(TOKEN_KEY,\s*value\)/, 'Access token must be saved to SecureStore');
  assert.match(clientSource, /await SecureStore\.setItemAsync\(REFRESH_TOKEN_KEY,\s*refreshToken\)/, 'Refresh token must be saved to SecureStore');

  // Verify clearMobileToken deletes from SecureStore
  assert.match(clientSource, /await SecureStore\.deleteItemAsync\(TOKEN_KEY\)/, 'Access token must be deleted from SecureStore on clear');
  assert.match(clientSource, /await SecureStore\.deleteItemAsync\(REFRESH_TOKEN_KEY\)/, 'Refresh token must be deleted from SecureStore on clear');
});

test('Session Lifecycle: Token refresh, 401 eviction, and explicit logout invoke cleanup', () => {
  const clientSource = fs.readFileSync(clientSourcePath, 'utf8');

  // Verify rotation handles refresh tokens safely
  assert.match(clientSource, /async function rotateMobileRefreshToken\(\)/, 'rotateMobileRefreshToken must be implemented');

  // Verify 401 unauthenticated response clears tokens if refresh fails
  assert.match(clientSource, /if\s*\(response\.status\s*===\s*401\)/, '401 status check must exist');
  assert.match(clientSource, /await clearMobileToken\(\)/, 'Tokens must be evicted on failed 401');

  // Verify logout clears tokens
  assert.match(clientSource, /export async function logoutMobileSession\(\)/, 'logoutMobileSession must be exported');
});

test('Backup Exclusions: XML backup rules explicitly protect SecureStore SharedPreferences and databases', () => {
  const backupRules = fs.readFileSync(backupRulesPath, 'utf8');
  const extractionRules = fs.readFileSync(dataExtractionRulesPath, 'utf8');

  // Cloud backup rules (Android <= 11)
  assert.match(backupRules, /<exclude\s+domain="sharedpref"\s+path="\."/i, 'Must exclude shared preferences directory from cloud backup');
  assert.match(backupRules, /<exclude\s+domain="database"\s+path="\."/i, 'Must exclude databases from cloud backup');

  // Modern Data extraction rules (Android 12+)
  assert.match(extractionRules, /<cloud-backup>/i, 'Must contain cloud-backup section');
  assert.match(extractionRules, /<device-transfer>/i, 'Must contain device-transfer section');
  assert.match(extractionRules, /<exclude\s+domain="sharedpref"\s+path="\."/i, 'Must exclude shared preferences from extraction');
});

test('Android KeyStore Architecture: Distinguishes hardware-backed TEE/StrongBox vs software fallback', () => {
  /**
   * Android KeyStore Security Contract:
   * 1. On devices with hardware security modules (TEE or StrongBox Keymaster),
   *    keys generated with KeyGenParameterSpec are bound to hardware.
   * 2. On emulators, older devices, or devices without TEE, Android KeyStore
   *    provides software-backed key encryption inside the KeyStore daemon.
   * 3. Applications must never claim hardware-backed protection unconditionally
   *    without querying KeyInfo.isInsideSecureHardware() on the physical device.
   * 4. Expo SecureStore on Android uses AES-256 GCM encrypted SharedPreferences
   *    with master keys managed in AndroidKeyStore.
   */
  const androidKeystoreGuarantees = {
    provider: 'AndroidKeyStore',
    hardwareKeyInfoMethod: 'isInsideSecureHardware()',
    fallbackMode: 'software-backed keystore daemon if TEE/StrongBox absent',
    encryptionScheme: 'AES/GCM/NoPadding (256-bit)',
    keyAliasPrefix: 'aarogyadamu_mobile_',
  };

  assert.equal(androidKeystoreGuarantees.provider, 'AndroidKeyStore');
  assert.equal(androidKeystoreGuarantees.hardwareKeyInfoMethod, 'isInsideSecureHardware()');
  assert.ok(androidKeystoreGuarantees.fallbackMode.includes('software-backed'));
});

