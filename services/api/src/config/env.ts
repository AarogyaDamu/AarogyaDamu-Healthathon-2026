import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('file:./dev.db'),
  JWT_SECRET: z.string().trim().min(32, 'JWT_SECRET must be at least 32 characters long').default('aarogyadamu_super_secure_clinical_jwt_secret_2026_dev_only'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_ISSUER: z.string().default('aarogyadamu-api'),
  JWT_AUDIENCE: z.string().default('aarogyadamu-clients'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(30),
  DOCTOR_INVITATION_SECRET: z.string().trim().min(32, 'DOCTOR_INVITATION_SECRET must be at least 32 characters long').default('aarogyadamu_doctor_invitation_secret_2026_dev_only'),
  DOCTOR_INVITATION_ADMIN_KEY: z.string().trim().min(32, 'DOCTOR_INVITATION_ADMIN_KEY must be at least 32 characters long').default('aarogyadamu_doctor_invitation_admin_key_2026_dev_only'),
  EMAIL_PROVIDER: z.enum(['disabled', 'resend']).default('disabled'),
  RESEND_API_KEY: z.string().optional().transform((value) => value?.trim() || undefined),
  EMAIL_FROM: z.string().optional().transform((value) => value?.trim() || undefined).pipe(z.string().email().optional()),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:8081'),
  TRUST_PROXY: z.string().default('false'),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional().transform((value) => value?.trim() || undefined),
  STORAGE_DIR: z.string().default(path.resolve(process.cwd(), 'uploads', 'private')),
  ALLOW_DEMO_AUTH: z.string().default('true').transform((val) => val === 'true'),
  GEMINI_API_KEY: z.string().trim().optional().transform((val) => (val && val.length > 0 ? val : undefined)),
}).superRefine((config, context) => {
  // 1. Distinct server-side secrets validation
  const secrets = [
    { name: 'JWT_SECRET', val: config.JWT_SECRET },
    { name: 'DOCTOR_INVITATION_SECRET', val: config.DOCTOR_INVITATION_SECRET },
    { name: 'DOCTOR_INVITATION_ADMIN_KEY', val: config.DOCTOR_INVITATION_ADMIN_KEY },
  ];
  for (let i = 0; i < secrets.length; i++) {
    for (let j = i + 1; j < secrets.length; j++) {
      if (secrets[i].val && secrets[j].val && secrets[i].val === secrets[j].val) {
        context.addIssue({
          code: 'custom',
          path: [secrets[j].name],
          message: `${secrets[i].name} and ${secrets[j].name} must be distinct cryptographically strong secrets.`,
        });
      }
    }
  }

  // 2. Email provider validation
  if (config.EMAIL_PROVIDER === 'resend' && (!config.RESEND_API_KEY || !config.EMAIL_FROM)) {
    context.addIssue({
      code: 'custom',
      path: ['EMAIL_PROVIDER'],
      message: 'Resend requires RESEND_API_KEY and EMAIL_FROM.',
    });
  }

  // 3. Trusted proxy validation (never allow blind wildcard trust)
  if (config.TRUST_PROXY === 'true') {
    context.addIssue({
      code: 'custom',
      path: ['TRUST_PROXY'],
      message: 'TRUST_PROXY cannot be "true" (unlimited hops). Specify hop count (e.g., "1") or trusted CIDR blocks.',
    });
  }

  // 4. Redis URL requirement if Redis rate limiting selected
  if (config.RATE_LIMIT_STORE === 'redis' && !config.REDIS_URL) {
    context.addIssue({
      code: 'custom',
      path: ['REDIS_URL'],
      message: 'REDIS_URL is required when RATE_LIMIT_STORE is set to "redis".',
    });
  }

  // 5. Strict production environment hardening
  if (config.NODE_ENV === 'production') {
    if (config.EMAIL_PROVIDER !== 'resend') {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'Production password-reset delivery requires EMAIL_PROVIDER=resend.',
      });
    }

    if (
      !process.env.JWT_SECRET ||
      config.JWT_SECRET.includes('dev_only') ||
      config.JWT_SECRET.startsWith('replace-with-')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Production requires a separately provisioned, distinct JWT_SECRET from your secret manager.',
      });
    }

    if (
      [config.DOCTOR_INVITATION_SECRET, config.DOCTOR_INVITATION_ADMIN_KEY]
        .some((val) => val.includes('dev_only') || val.startsWith('replace-with-'))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['DOCTOR_INVITATION_SECRET'],
        message: 'Production requires provisioned, distinct invitation secrets, not default or placeholder values.',
      });
    }

    if (
      config.RESEND_API_KEY?.startsWith('replace-with-') ||
      config.EMAIL_FROM?.endsWith('@example.com') ||
      config.EMAIL_FROM?.endsWith('.local') ||
      config.WEB_APP_URL.includes('example.com') ||
      config.WEB_APP_URL.includes('localhost')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Production email delivery requires verified sender address and production web URL.',
      });
    }

    if (config.ALLOWED_ORIGINS.includes('*') || config.ALLOWED_ORIGINS.includes('localhost')) {
      context.addIssue({
        code: 'custom',
        path: ['ALLOWED_ORIGINS'],
        message: 'Production CORS cannot contain wildcard "*" or "localhost" origins.',
      });
    }

    if (config.API_PUBLIC_URL.includes('localhost')) {
      context.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'Production API_PUBLIC_URL must be a public HTTPS URL, not localhost.',
      });
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  const sanitizedErrors = parsed.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  console.error(JSON.stringify(sanitizedErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
