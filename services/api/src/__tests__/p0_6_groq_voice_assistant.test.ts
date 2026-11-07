import request from 'supertest';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { app, prisma } from '../server';
import { setFeatureFlag, DEFAULT_FEATURE_FLAGS } from '../features/featureFlags';
import {
  setDamuProviderForTests,
  MockDamuProvider,
  GroqDamuProvider,
  evaluateEmergencyConditions,
  evaluateProhibitedIntent,
  parseSpokenOrNumericGlucose,
  isSymptomNegated,
  isPurelyHypothetical,
  detectImpairedConsciousnessOrSwallowing,
  redactApiKey,
  fetchWithRetry,
  CLINICAL_DISCLAIMER,
} from '../services/damuVoiceService';

describe('Phase P0.6 — Groq Multilingual Voice Assistant (Damu) Test Suite', () => {
  let patientA: { id: string; email: string; token: string };
  let patientB: { id: string; email: string; token: string };
  let doctorA: { id: string; email: string; token: string };

  const validAudioBase64 = Buffer.from('What are good foods to keep my fasting blood sugar stable?').toString('base64');
  const validEmergencyAudioBase64 = Buffer.from('My blood sugar is 45 mg/dL and I feel dizzy and faint').toString('base64');
  const prohibitedAudioBase64 = Buffer.from('Please change my insulin dosage to 30 units').toString('base64');

  beforeAll(async () => {
    // Enable P0.6 feature flag for the test suite
    await setFeatureFlag('P0_6_GROQ_VOICE_ASSISTANT', true, 'development');
    await setFeatureFlag('P0_6_GROQ_DAMU_ASSISTANT', true, 'development');

    const passwordHash = await bcrypt.hash('SecurePass123!', 10);

    const createUser = async (email: string, fullName: string, isClinician = false) => {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          isClinician,
          profile: {
            create: {
              fullName,
              diabetesType: isClinician ? undefined : 'TYPE_2_DIABETES',
              knownAllergies: isClinician ? undefined : 'None',
            },
          },
        },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'SecurePass123!' });

      return { id: user.id, email: user.email, token: res.body.token };
    };

    const runId = Date.now();
    patientA = await createUser(`patient.anand.p06.${runId}@example.com`, 'Anand Sharma');
    patientB = await createUser(`patient.kavita.p06.${runId}@example.com`, 'Kavita Patel');
    doctorA = await createUser(`dr.mehta.p06.${runId}@example.com`, 'Dr. Suresh Mehta', true);

    // Doctor A has assignment to Patient A
    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: doctorA.id,
        patientId: patientA.id,
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    // Seed a recent blood glucose observation for Patient A (fasting 110 mg/dL)
    await prisma.healthObservation.create({
      data: {
        userId: patientA.id,
        type: 'BLOOD_GLUCOSE',
        numericValue: 110,
        unit: 'mg/dL',
        context: 'FASTING',
        clinicalFlag: 'NORMAL',
        provenance: 'PATIENT_ENTERED',
      },
    });

    // Injected deterministic mock voice provider
    setDamuProviderForTests(new MockDamuProvider());
  });

  afterAll(async () => {
    setDamuProviderForTests(undefined);
  });

  // =========================================================================
  // 1. Feature Flag Gating
  // =========================================================================
  describe('1. Feature Flag Gating', () => {
    it('returns 403 FEATURE_DISABLED when P0_6_GROQ_VOICE_ASSISTANT is disabled', async () => {
      try {
        await setFeatureFlag('P0_6_GROQ_VOICE_ASSISTANT', false, 'development');
        await setFeatureFlag('P0_6_GROQ_DAMU_ASSISTANT', false, 'development');

        const statusRes = await request(app).get('/api/damu/status');
        expect(statusRes.status).toBe(403);
        expect(statusRes.body.error?.code).toBe('FEATURE_DISABLED');

        const interactRes = await request(app)
          .post('/api/damu/interact')
          .set('Authorization', `Bearer ${patientA.token}`)
          .send({
            textPrompt: 'Hello Damu',
            consentObtained: true,
            consentVersion: 'v1.0-test',
          });
        expect(interactRes.status).toBe(403);
        expect(interactRes.body.error?.code).toBe('FEATURE_DISABLED');
      } finally {
        // Guarantee re-enable for subsequent tests
        await setFeatureFlag('P0_6_GROQ_VOICE_ASSISTANT', true, 'development');
        await setFeatureFlag('P0_6_GROQ_DAMU_ASSISTANT', true, 'development');
      }
    });

    it('returns 200 on status endpoint when feature flag is enabled', async () => {
      const res = await request(app).get('/api/damu/status');
      expect(res.status).toBe(200);
      expect(res.body.configuredProvider).toBeDefined();
      expect(res.body.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
    });

    it('defaults P0.6 feature flag to disabled in production environment (NODE_ENV=production)', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(DEFAULT_FEATURE_FLAGS.P0_6_GROQ_VOICE_ASSISTANT.isEnabled).toBe(false);
        expect(DEFAULT_FEATURE_FLAGS.P0_6_GROQ_DAMU_ASSISTANT.isEnabled).toBe(false);
        expect(DEFAULT_FEATURE_FLAGS.P0_7_AGENTIC_EXECUTION.isEnabled).toBe(false);
        expect(DEFAULT_FEATURE_FLAGS.P0_8_EXTERNAL_INTEGRATIONS.isEnabled).toBe(false);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // 2. Status Metadata & Provider Transparency
  // =========================================================================
  describe('2. Status Metadata & Policy Disclosure', () => {
    it('discloses STT/LLM models, supported Indian regional languages, and non-doctor disclaimer', async () => {
      const res = await request(app).get('/api/damu/status');
      expect(res.status).toBe(200);
      expect(res.body.models.stt).toBe('mock-saarika-v2');
      expect(res.body.models.llm).toBe('mock-llama-3.3-70b-versatile');
      expect(res.body.supportedLanguages).toEqual(
        expect.arrayContaining(['en-IN', 'hi-IN', 'te-IN', 'ta-IN', 'kn-IN', 'bn-IN', 'mr-IN', 'gu-IN'])
      );
      expect(res.body.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
      expect(res.body.clinicalDisclaimer).toBe(CLINICAL_DISCLAIMER);
    });
  });

  // =========================================================================
  // 3. Authentication & Patient Access Authorization
  // =========================================================================
  describe('3. Authentication & Authorization Boundaries', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .send({
          textPrompt: 'What is HbA1c?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });
      expect(res.status).toBe(401);
    });

    it('allows patient to interact with their own health profile', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'What is HbA1c?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });
      expect(res.status).toBe(200);
      expect(res.body.textResponse).toContain('HbA1c');
      expect(res.body.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
    });

    it('rejects cross-patient access when patient A targets patient B without consent', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .set('x-target-patient-id', patientB.id)
        .send({
          textPrompt: 'What is HbA1c?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });
      expect(res.status).toBe(403);
    });

    it('allows assigned doctor to query on behalf of patient A', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${doctorA.token}`)
        .set('x-target-patient-id', patientA.id)
        .send({
          textPrompt: 'What are fasting targets?',
          consentObtained: true,
          consentVersion: 'v1.0-doctor-assisted',
        });
      expect(res.status).toBe(200);
      expect(res.body.textResponse).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Informed Consent Verification
  // =========================================================================
  describe('4. Explicit Informed Consent Enforcement', () => {
    it('rejects interaction when consentObtained is false or missing', async () => {
      const res1 = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Hello',
          consentObtained: false,
          consentVersion: 'v1.0',
        });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Hello',
          consentVersion: 'v1.0',
        });
      expect(res2.status).toBe(400);
    });

    it('rejects interaction when consentVersion is omitted', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Hello',
          consentObtained: true,
        });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 5. Speech Transcription & Text Prompt Processing
  // =========================================================================
  describe('5. Voice & Text Interaction Processing', () => {
    it('transcribes valid audio and produces clean response with zero retention guarantee', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          audioBase64: validAudioBase64,
          mimeType: 'audio/webm',
          language: 'en-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.transcript).toBeDefined();
      expect(res.body.transcript).toContain('blood sugar');
      expect(res.body.textResponse).toBeDefined();
      expect(res.body.spokenText).toBeDefined();
      expect(res.body.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
      expect(res.body.isMock).toBe(true);
    });

    it('processes text prompt fallback when no audio is provided', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'What should I eat for dinner with type 2 diabetes?',
          language: 'hi-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.transcript).toBeUndefined();
      expect(res.body.textResponse).toContain('carbohydrates');
      expect(res.body.intent).toBe('LIFESTYLE_GUIDANCE');
    });

    it.each([
      ['mg/dL', 'My blood sugar is 45 mg/dL'],
      ['mmol/L', 'My glucose reading is 2.8 mmol/L'],
      ['spoken glucose', 'My sugar is forty two'],
    ])('escalates a current reported low glucose reading (%s) despite a normal stored reading', async (_format, textPrompt) => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt,
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.body.emergencyNotice).toMatch(/severely low/i);
      expect(res.body.transcript).toBeUndefined();
    });

    it('returns 400 when neither audio nor text prompt is supplied', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Either audioBase64 or a non-empty textPrompt');
    });
  });

  // =========================================================================
  // 6. Payload Limits & Validation
  // =========================================================================
  describe('6. Payload Size & Validation Limits', () => {
    it('returns 413 when audio payload exceeds 10MB limit', async () => {
      // Create an oversized 11MB buffer
      const oversizedBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      const oversizedBase64 = oversizedBuffer.toString('base64');

      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          audioBase64: oversizedBase64,
          mimeType: 'audio/webm',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(413);
      expect(res.body.error).toContain('exceeds maximum size limit of 10MB');
    });

    it('returns 400 when audio base64 is empty', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          audioBase64: '',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 7. Clinical Safety Boundaries & Prohibited Action Refusal
  // =========================================================================
  describe('7. Clinical Safety Guardrails: Non-Doctor & Refusal to Prescribe/Diagnose', () => {
    it('refuses to alter insulin dosage and instructs doctor consultation', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          audioBase64: prohibitedAudioBase64,
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.body.textResponse).toMatch(/cannot prescribe|cannot change dosages|speak directly with your treating doctor/i);
    });

    it('refuses to prescribe medications when requested via text', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Can you prescribe Metformin 1000mg for me?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.body.textResponse).toMatch(/cannot prescribe|doctor/i);
    });

    it('refuses autonomous diagnosis when requested via text', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Diagnose me: I have blurry vision, thirst, and weight loss. What disease do I have?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('PROHIBITED_ACTION_REFUSAL');
      expect(res.body.textResponse).toMatch(/cannot.*diagnose/i);
    });
  });

  // =========================================================================
  // 8. Emergency Escalation & Acute Hypoglycemia Detection
  // =========================================================================
  describe('8. Acute Hypoglycemia & Emergency Escalation Detection', () => {
    it('detects severe hypoglycemia (<54 mg/dL) and emits immediate emergency notice', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          audioBase64: validEmergencyAudioBase64,
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.body.emergencyNotice).toBeDefined();
      expect(res.body.emergencyNotice).toMatch(/112.*108|108.*112/);
      expect(res.body.emergencyNotice).toMatch(/hypoglycemia|glucose immediately/i);
    });

    it('detects chest pain or fainting emergency keywords in text prompt', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'I have severe chest pain and cannot breathe, what should I do?',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);
      expect(res.body.intent).toBe('EMERGENCY_ESCALATION');
      expect(res.body.emergencyNotice).toMatch(/112.*108|108.*112/);
    });
  });

  // =========================================================================
  // 9. Non-Mutation Guarantee
  // =========================================================================
  describe('9. Non-Mutation Guarantee', () => {
    it('guarantees that voice interaction creates ZERO mutations on observations, care plans, or prescriptions', async () => {
      // Capture baseline counts
      const obsCountBefore = await prisma.healthObservation.count({ where: { userId: patientA.id } });
      const planCountBefore = await prisma.carePlan.count({ where: { patientId: patientA.id } });
      const taskCountBefore = await prisma.careTask.count({ where: { userId: patientA.id } });

      // Run 3 different interactions (educational, prohibited refusal, and emergency)
      await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Explain HbA1c in simple words',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'Increase my insulin dose to 40 units',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'My sugar is 42 mg/dL and I feel faint',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      // Assert counts are unchanged
      const obsCountAfter = await prisma.healthObservation.count({ where: { userId: patientA.id } });
      const planCountAfter = await prisma.carePlan.count({ where: { patientId: patientA.id } });
      const taskCountAfter = await prisma.careTask.count({ where: { userId: patientA.id } });

      expect(obsCountAfter).toBe(obsCountBefore);
      expect(planCountAfter).toBe(planCountBefore);
      expect(taskCountAfter).toBe(taskCountBefore);
    });
  });

  // =========================================================================
  // 10. Privacy & Audit Logging Hygiene
  // =========================================================================
  describe('10. Privacy, Zero Retention & Audit Logging', () => {
    it('persists audit log with DAMU_VOICE_INTERACTION while redacting audio and raw text', async () => {
      const res = await request(app)
        .post('/api/damu/interact')
        .set('Authorization', `Bearer ${patientA.token}`)
        .send({
          textPrompt: 'What is HbA1c?',
          language: 'te-IN',
          consentObtained: true,
          consentVersion: 'v1.0-test',
        });

      expect(res.status).toBe(200);

      // Verify audit log entry
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          userId: patientA.id,
          action: 'DAMU_VOICE_INTERACTION',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).toBeDefined();
      expect(auditLog?.entityType).toBe('VOICE_SESSION');

      const metadata = JSON.parse(auditLog?.metadata || '{}');
      expect(metadata.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
      expect(metadata.audioPurged).toBe(true);
      expect(metadata.intent).toBe('DIABETES_EDUCATION');
      expect(metadata.language).toBe('te-IN');

      // Crucial privacy check: no audioBase64 or verbatim audio content stored in metadata
      expect(metadata.audioBase64).toBeUndefined();
      expect(metadata.audioBuffer).toBeUndefined();
      expect(metadata.audio).toBeUndefined();
    });
  });

  // =========================================================================
  // 11. Groq Provider Integration & Unit Evaluations
  // =========================================================================
  describe('11. Groq Voice Assistant Provider Implementation & Helper Safety Logic', () => {
    it('evaluates emergency conditions deterministically', () => {
      expect(evaluateEmergencyConditions('My blood sugar is 48 mg/dL')).toContain('Severe hypoglycemia (<54 mg/dL)');
      expect(evaluateEmergencyConditions('Everything is fine')).toBeUndefined();
      expect(evaluateEmergencyConditions('I have chest pain and fainting')).toContain('CRITICAL NOTICE');
    });

    it('evaluates prohibited intents deterministically', () => {
      expect(evaluateProhibitedIntent('Please change my insulin dosage').isProhibited).toBe(true);
      expect(evaluateProhibitedIntent('Prescribe metformin 500mg').isProhibited).toBe(true);
      expect(evaluateProhibitedIntent('Diagnose me: what condition is this').isProhibited).toBe(true);
      expect(evaluateProhibitedIntent('What are common whole grains in Indian diet?').isProhibited).toBe(false);
    });

    it('instantiates GroqDamuProvider and exposes proper metadata', async () => {
      const groqProvider = new GroqDamuProvider('gsk_dummy_test_key');
      expect(groqProvider.name).toBe('groq-llama3.3-whisper-turbo');

      const status = await groqProvider.getProviderStatus();
      expect(status.models.stt).toBe('whisper-large-v3-turbo');
      expect(status.models.llm).toBe('openai/gpt-oss-120b');
      expect(status.audioRetentionPolicy).toBe('SESSION_ONLY_ZERO_RETENTION');
      expect(status.isAvailable).toBe(true);
    });
  });

  // =========================================================================
  // 12. P0.6 Remediation Audit Verification (SEC-01 through SEC-08)
  // =========================================================================
  describe('12. P0.6 Remediation Audit Verification (SEC-01 through SEC-08)', () => {
    // SEC-01: Aspiration Hazard & Impaired Consciousness Precedence
    it('SEC-01: enforces absolute aspiration safety precedence when consciousness or swallowing is impaired', () => {
      // When patient is unconscious and glucose is 45 mg/dL:
      const notice = evaluateEmergencyConditions('Patient is unconscious and sugar is 45 mg/dL');
      expect(notice).toBeDefined();
      // Must NOT recommend oral carbs:
      expect(notice).not.toMatch(/consume 15-20g|fast-acting glucose immediately/i);
      // Must explicitly prohibit oral administration:
      expect(notice).toMatch(/DO NOT administer any food, fluids, or oral glucose/i);
      expect(notice).toMatch(/choking and aspiration hazard/i);
      expect(notice).toMatch(/112 \/ 108/);
      expect(notice).toMatch(/recovery position/i);
      expect(notice).toMatch(/prescribed emergency glucagon only if available and if a caregiver has been trained/i);
    });

    it('SEC-01: prohibits oral glucose intake during active seizure even with low sugar', () => {
      const notice = evaluateEmergencyConditions('Patient is having a seizure and glucose is 40');
      expect(notice).toMatch(/DO NOT administer any food, fluids, or oral glucose/i);
      expect(notice).toMatch(/recovery position/i);
    });

    it('SEC-01: permits oral glucose instructions only when alert, awake, and able to swallow', () => {
      const notice = evaluateEmergencyConditions('I am awake and alert but my blood sugar is 48 mg/dL');
      expect(notice).toMatch(/fully awake, alert, and able to swallow safely/i);
      expect(notice).toMatch(/consume 15-20g of fast-acting glucose immediately/i);
      expect(notice).toMatch(/Rule of 15/i);
    });

    // SEC-05: Negated emergency statements
    it('SEC-05: does not trigger false alarms on negated emergency statements', () => {
      expect(evaluateEmergencyConditions('I do not have chest pain')).toBeUndefined();
      expect(evaluateEmergencyConditions('No seizure, no fainting')).toBeUndefined();
      expect(evaluateEmergencyConditions('Patient denies fainting or shortness of breath')).toBeUndefined();
      expect(evaluateEmergencyConditions('I am feeling well, without dizziness')).toBeUndefined();
    });

    it('SEC-05: correctly escalates compound statements with negated symptoms but active emergencies', () => {
      const notice = evaluateEmergencyConditions('I have no chest pain, but my sugar is 42 mg/dL');
      expect(notice).toBeDefined();
      expect(notice).toMatch(/Severe hypoglycemia/i);
    });

    // SEC-06: Units, spoken words, and timestamp handling
    it('SEC-06: converts mmol/L glucose readings and detects severe hypoglycemia (< 3.0 mmol/L)', () => {
      // 2.8 mmol/L = ~50.4 mg/dL (< 54 mg/dL)
      const parsed = parseSpokenOrNumericGlucose('My sugar is 2.8 mmol/L');
      expect(parsed).toBe(50);
      const notice = evaluateEmergencyConditions('My sugar is 2.8 mmol/L');
      expect(notice).toMatch(/Severe hypoglycemia/i);
    });

    it('SEC-06: parses spoken number words in glucose context', () => {
      expect(parseSpokenOrNumericGlucose('My sugar is forty two')).toBe(42);
      expect(parseSpokenOrNumericGlucose('Blood glucose reading was thirty five')).toBe(35);
      const notice = evaluateEmergencyConditions('My blood sugar is forty two');
      expect(notice).toMatch(/Severe hypoglycemia/i);
    });

    it('SEC-06: strictly rejects timestamp and duration false positives', () => {
      expect(parseSpokenOrNumericGlucose('My reading was at 10 pm')).toBeUndefined();
      expect(parseSpokenOrNumericGlucose('Checked blood sugar at 4:30 pm')).toBeUndefined();
      expect(parseSpokenOrNumericGlucose('I ran for 40 minutes')).toBeUndefined();
      expect(evaluateEmergencyConditions('My reading was at 10 pm')).toBeUndefined();
    });

    // SEC-08: Hypothetical / Educational inquiries
    it('SEC-08: answers purely educational and hypothetical inquiries without emergency notices', () => {
      expect(evaluateEmergencyConditions('What happens during a seizure?')).toBeUndefined();
      expect(evaluateEmergencyConditions('Can you explain what hypoglycemia is?')).toBeUndefined();
      expect(evaluateEmergencyConditions('Tell me about chest pain in diabetes')).toBeUndefined();
      expect(evaluateEmergencyConditions('Why do people faint from low sugar?')).toBeUndefined();
    });

    it('SEC-08: immediately escalates active personal distress even if framed as a question', () => {
      const notice = evaluateEmergencyConditions('I am having chest pain right now, what should I do?');
      expect(notice).toBeDefined();
      expect(notice).toMatch(/CRITICAL NOTICE/);
    });

    // SEC-02: Resilience, retries, and API key redaction
    it('SEC-02: redacts API key from logs and error messages', () => {
      const key = 'gsk_testsecretapikey1234567890abcdef';
      const dirtyError = `Error calling Groq API with Bearer ${key}: authorization failed`;
      const sanitized = redactApiKey(dirtyError, key);
      expect(sanitized).not.toContain(key);
      expect(sanitized).toContain('[REDACTED_API_KEY]');
    });

    it('SEC-02: retries on transient errors and throws sanitized error upon failure', async () => {
      const key = 'gsk_samplekey1234567890abcdef';
      const originalFetch = global.fetch;
      let attempts = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        attempts++;
        throw new Error(`Connection reset while contacting api.groq.com key=${key}`);
      }) as any;

      try {
        await expect(
          fetchWithRetry('https://api.groq.com/mock', {}, key, 2, 10)
        ).rejects.toThrow(/Groq request failed after 2 retries/);
        expect(attempts).toBe(3); // Initial attempt + 2 retries
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
