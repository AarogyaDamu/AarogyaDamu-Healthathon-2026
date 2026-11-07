import { envSchema } from '../config/env';

describe('Environment Policy: Staging vs Production Validation', () => {
  const validStagingBase = {
    NODE_ENV: 'production',
    APP_ENV: 'staging',
    PORT: '4000',
    DATABASE_URL: 'postgresql://db_user:strong_prod_pass_1234@db-staging.aarogyadamu.net:5432/aarogyadamu_staging?schema=public',
    JWT_SECRET: 'super_secret_jwt_key_that_is_at_least_32_chars_long_and_secure',
    DOCTOR_INVITATION_SECRET: 'distinct_doctor_invitation_secret_32_characters_minimum',
    DOCTOR_INVITATION_ADMIN_KEY: 'distinct_admin_key_for_doctor_invites_32_chars_min',
    ALLOWED_ORIGINS: 'https://staging.aarogyadamu.net,https://staging-doctor.aarogyadamu.net',
    WEB_APP_URL: 'https://staging-doctor.aarogyadamu.net',
    API_PUBLIC_URL: 'https://staging.aarogyadamu.net',
    MEDICAL_REPORT_OCR_PROVIDER: 'synthetic',
    EMAIL_PROVIDER: 'disabled',
    ALLOW_DEMO_AUTH: 'false',
    ENABLE_DEV_DEMO_MODE: 'false',
  };

  test('validates staging deployment with synthetic OCR and disabled email', () => {
    const result = envSchema.safeParse(validStagingBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_ENV).toBe('staging');
      expect(result.data.NODE_ENV).toBe('production');
      expect(result.data.MEDICAL_REPORT_OCR_PROVIDER).toBe('synthetic');
      expect(result.data.EMAIL_PROVIDER).toBe('disabled');
      expect(result.data.ALLOW_DEMO_AUTH).toBe(false);
    }
  });

  test('validates staging deployment with Google Vision and Resend when configured', () => {
    const stagingWithResend = {
      ...validStagingBase,
      MEDICAL_REPORT_OCR_PROVIDER: 'google_vision',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_staging_valid_key_1234567890',
      EMAIL_FROM: 'noreply@aarogyadamu.net',
    };
    const result = envSchema.safeParse(stagingWithResend);
    expect(result.success).toBe(true);
  });

  test('rejects staging deployment if Resend is selected with placeholder keys or local domain', () => {
    const stagingWithBadResend = {
      ...validStagingBase,
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'replace-with-your-key',
      EMAIL_FROM: 'care@aarogyadamu.local',
    };
    const result = envSchema.safeParse(stagingWithBadResend);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('verified sender address'))).toBe(true);
    }
  });

  test('rejects actual production when MEDICAL_REPORT_OCR_PROVIDER is synthetic', () => {
    const prodWithSyntheticOcr = {
      ...validStagingBase,
      APP_ENV: 'production',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_prod_valid_key_1234567890',
      EMAIL_FROM: 'care@aarogyadamu.org',
      MEDICAL_REPORT_OCR_PROVIDER: 'synthetic',
    };
    const result = envSchema.safeParse(prodWithSyntheticOcr);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Production medical report OCR must use MEDICAL_REPORT_OCR_PROVIDER=google_vision.');
    }
  });

  test('rejects actual production when EMAIL_PROVIDER is disabled', () => {
    const prodWithDisabledEmail = {
      ...validStagingBase,
      APP_ENV: 'production',
      MEDICAL_REPORT_OCR_PROVIDER: 'google_vision',
      EMAIL_PROVIDER: 'disabled',
    };
    const result = envSchema.safeParse(prodWithDisabledEmail);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Production password-reset delivery requires EMAIL_PROVIDER=resend.');
    }
  });

  test('validates actual production when both Google Vision and Resend are configured properly', () => {
    const fullProduction = {
      ...validStagingBase,
      APP_ENV: 'production',
      MEDICAL_REPORT_OCR_PROVIDER: 'google_vision',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_prod_secure_api_key_abcdef123456',
      EMAIL_FROM: 'notifications@aarogyadamu.org',
      ALLOWED_ORIGINS: 'https://doctor.aarogyadamu.org,https://api.aarogyadamu.org',
      WEB_APP_URL: 'https://doctor.aarogyadamu.org',
      API_PUBLIC_URL: 'https://api.aarogyadamu.org',
    };
    const result = envSchema.safeParse(fullProduction);
    expect(result.success).toBe(true);
  });

  test('enforces common security invariants in both staging and production', () => {
    // 1. ALLOW_DEMO_AUTH cannot be true
    const demoAuthStaging = { ...validStagingBase, ALLOW_DEMO_AUTH: 'true' };
    const demoAuthResult = envSchema.safeParse(demoAuthStaging);
    expect(demoAuthResult.success).toBe(false);

    // 2. Wildcard CORS is rejected
    const wildcardCorsStaging = { ...validStagingBase, ALLOWED_ORIGINS: '*' };
    const wildcardResult = envSchema.safeParse(wildcardCorsStaging);
    expect(wildcardResult.success).toBe(false);

    // 3. HTTP origins are rejected
    const httpCorsStaging = { ...validStagingBase, ALLOWED_ORIGINS: 'http://insecure-site.com' };
    const httpResult = envSchema.safeParse(httpCorsStaging);
    expect(httpResult.success).toBe(false);

    // 4. Development JWT secret is rejected
    const devJwtStaging = { ...validStagingBase, JWT_SECRET: 'aarogyadamu_super_secure_clinical_jwt_secret_2026_dev_only' };
    const devJwtResult = envSchema.safeParse(devJwtStaging);
    expect(devJwtResult.success).toBe(false);

    // 5. Default/dev doctor invitation secrets are rejected
    const devInviteStaging = { ...validStagingBase, DOCTOR_INVITATION_SECRET: 'aarogyadamu_doctor_invitation_secret_2026_dev_only' };
    const devInviteResult = envSchema.safeParse(devInviteStaging);
    expect(devInviteResult.success).toBe(false);
  });
});
