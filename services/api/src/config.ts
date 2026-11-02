import { env } from './config/env';

const isProduction = env.NODE_ENV === 'production';

const configuredOrigins = env.ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  isProduction,
  jwtSecret: env.JWT_SECRET,
  jwtIssuer: env.JWT_ISSUER,
  jwtAudience: env.JWT_AUDIENCE,
  allowedOrigins: configuredOrigins,
  demoModeEnabled: isProduction ? false : env.ALLOW_DEMO_AUTH,
  port: env.PORT,
} as const;
