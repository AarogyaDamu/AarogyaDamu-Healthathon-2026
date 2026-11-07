# AarogyaDamu — Production Deployment Guide & Runbook

**Intended Production Custom Domain Placeholder:** `https://app.example.com`
**API & Interoperability Gateway:** `https://app.example.com/api`
**HL7 FHIR R4 Base URL:** `https://app.example.com/api/fhir/r4`
**Target Environment:** Cloud VPS / Container Platform (AWS ECS, GCP Cloud Run, DigitalOcean, or Bare-Metal Linux)

---

## 1. Prerequisites

- **Runtime:** Node.js `>= 20.12.0` (Recommended: Node.js 20 LTS)
- **Package Manager:** npm `>= 10.8.0`
- **Database:** PostgreSQL `>= 15.0` with `uuid-ossp` or standard UUID generation
- **Cache (Optional / Multi-Instance):** Redis `>= 7.0` for distributed rate limiting
- **SSL / TLS Certificate:** Valid X.509 certificate (Let's Encrypt / AWS Certificate Manager)
- **Mobile Build Tooling:** EAS CLI (`npm install -g eas-cli`) or Android SDK for local APK generation

---

## 2. Environment Variables Configuration

Copy templates to `.env` files and populate with high-entropy production secrets:

### Core API (`services/api/.env`)
```bash
NODE_ENV="production"
APP_ENV="production"
PORT=4000
DATABASE_URL="postgresql://db_user:secure_password@db-host:5432/aarogyadamu_prod?schema=public&sslmode=require"

# Cryptographic Authentication Secrets (Min 32 characters)
JWT_SECRET="generate-with-openssl-rand-hex-32-chars-minimum"
JWT_EXPIRES_IN="15m"
JWT_ISSUER="aarogyadamu-api"
JWT_AUDIENCE="aarogyadamu-clients"
REFRESH_TOKEN_EXPIRES_DAYS=30

# Doctor Provisioning Keys
DOCTOR_INVITATION_SECRET="generate-separate-32-char-random-secret"
DOCTOR_INVITATION_ADMIN_KEY="generate-distinct-32-char-admin-key"

# Email Delivery (Resend)
EMAIL_PROVIDER="resend"
RESEND_API_KEY="re_prod_xxxxxxxxxxxxxx"
EMAIL_FROM="care@app.example.com"
WEB_APP_URL="https://app.example.com"
API_PUBLIC_URL="https://app.example.com/api"

# FHIR Interoperability Endpoint
FHIR_SERVER_URL="https://app.example.com/api/fhir/r4"

# Network & Proxy Hardening
ALLOWED_ORIGINS="https://app.example.com"
TRUST_PROXY="1" # Trust 1 upstream hop (Cloudflare, ALB, NGINX)
RATE_LIMIT_STORE="memory" # or "redis" with REDIS_URL
```

### Doctor WebApp (`apps/web/.env`)
```bash
VITE_APP_ENV=production
VITE_API_URL=https://app.example.com/api
```

### Mobile App (`apps/mobile/.env` or EAS Secret)
```bash
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_API_URL=https://app.example.com/api
```

---

## 3. Database Deployment & Migrations

```bash
# 1. Apply all production migrations safely
npm run db:deploy

# 2. Seed initial synthetic clinical baseline (Optional for staging/demo verification)
npm run db:seed
```

---

## 4. Doctor WebApp Production Build & Hosting

```bash
# Build production web bundle
npm --workspace=apps/web run build
```

The output will be placed in `apps/web/dist`. Host with any modern static web server with Single Page Application (SPA) routing fallback.

### NGINX Configuration Example (`/etc/nginx/sites-available/app.example.com`):
```nginx
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Doctor WebApp Static Files & SPA Routing
    root /var/www/aarogyadamu/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Gateway Reverse Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health Check Proxy
    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
    }
}
```

---

## 5. API Process Management (PM2)

```bash
# Compile TypeScript API
npm run build:api

# Start production API cluster
pm2 start services/api/dist/server.js --name "aarogyadamu-api" -i max
pm2 save
pm2 startup
```

---

## 6. Android Mobile Production Build (Expo EAS)

The mobile app (`apps/mobile`) provides dual experiences (Patient and Caregiver) compiled into a single unified APK/AAB package.

```bash
cd apps/mobile

# Configure EAS CLI
eas login
eas project:init

# Build Android Production App Bundle (AAB for Google Play)
eas build --platform android --profile production

# Or Build Standalone Installable APK (for testing & evaluator sideloading):
eas build --platform android --profile staging
```

Android Manifest invariants configured in `apps/mobile/app.json`:
- **Package Identifier:** `in.panumirge.aarogyadamu`
- **Permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`
- **Branded Icons:** Adaptive icon using `damu.png` with teal primary branding (`#0D9488`).

---

## 7. Health & Monitoring Endpoints

| Endpoint | Purpose | Expected Status |
| :--- | :--- | :--- |
| `GET /health` | Basic liveness probe for load balancers | `200 OK` `{"status":"healthy"}` |
| `GET /health/live` | Process liveness check | `200 OK` |
| `GET /health/ready` | Readiness probe (verifies database connectivity) | `200 OK` |
| `GET /api/fhir/r4/metadata` | HL7 FHIR R4 CapabilityStatement | `200 OK` (FHIR JSON) |
