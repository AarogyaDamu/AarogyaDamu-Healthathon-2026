import request from 'supertest';
import { app, prisma } from '../server';

describe('AarogyaDamu Clinical Security & Authorization Suite', () => {
  let patientAToken: string;
  let patientAId: string;
  let patientBToken: string;
  let patientBId: string;
  let patientBObservationId: string;

  beforeAll(async () => {
    // Clean test accounts
    await prisma.caregiverConsent.deleteMany();
    await prisma.healthObservation.deleteMany();
    await prisma.careTask.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['alice.test@aarogyadamu.local', 'bob.test@aarogyadamu.local'] } },
    });

    // 1. Register Patient A (Alice)
    const resA = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice.test@aarogyadamu.local',
        password: 'Password123!',
        fullName: 'Alice Test Patient',
      });
    patientAToken = resA.body.token;
    patientAId = resA.body.user.id;

    // 2. Register Patient B (Bob)
    const resB = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'bob.test@aarogyadamu.local',
        password: 'Password123!',
        fullName: 'Bob Test Patient',
      });
    patientBToken = resB.body.token;
    patientBId = resB.body.user.id;

    // 3. Create a private blood glucose observation for Patient B
    const obsRes = await request(app)
      .post('/api/observations')
      .set('Authorization', `Bearer ${patientBToken}`)
      .send({
        numericValue: 145,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Bob private reading',
      });
    patientBObservationId = obsRes.body.observation.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // TEST 1: Cross-Patient Data Isolation
  // -------------------------------------------------------------
  test('SECURITY: Patient A cannot read Patient B observations via spoofed header', async () => {
    const res = await request(app)
      .get('/api/observations')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('X-Target-Patient-Id', patientBId); // Alice attempts to access Bob's data without consent

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/i);
  });

  // -------------------------------------------------------------
  // TEST 2: Legitimate Caregiver Delegation Scope
  // -------------------------------------------------------------
  test('CONSENT: Caregiver access succeeds once patient explicitly authorizes delegation', async () => {
    // Bob grants Alice read-only access to observations
    await request(app)
      .post('/api/consents')
      .set('Authorization', `Bearer ${patientBToken}`)
      .send({
        caregiverEmail: 'alice.test@aarogyadamu.local',
        caregiverName: 'Alice Test Patient',
        relationship: 'DAUGHTER',
        permissions: ['VIEW_OBSERVATIONS'],
      });

    // Alice fetches Bob's observations using delegated scope
    const res = await request(app)
      .get('/api/observations')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('X-Target-Patient-Id', patientBId);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.observations)).toBe(true);
    expect(res.body.observations.length).toBeGreaterThan(0);
    expect(res.body.observations[0].numericValue).toBe(145);
  });

  // -------------------------------------------------------------
  // TEST 3: Caregiver Privilege Escalation Prevention
  // -------------------------------------------------------------
  test('SECURITY: Read-only caregiver cannot perform write actions (MANAGE_TASKS)', async () => {
    // Alice has VIEW_OBSERVATIONS only. Attempting to create a task for Bob must fail with 403.
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('X-Target-Patient-Id', patientBId)
      .send({
        title: 'Unauthorized Task Created by Caregiver',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/i);
  });

  // -------------------------------------------------------------
  // TEST 4: Immediate Revocation Enforcement
  // -------------------------------------------------------------
  test('SECURITY: Revoking consent immediately terminates caregiver read access', async () => {
    // Find Bob's consent record for Alice
    const consentRecord = await prisma.caregiverConsent.findFirst({
      where: { patientId: patientBId, caregiverEmail: 'alice.test@aarogyadamu.local' },
    });

    expect(consentRecord).toBeDefined();

    // Bob revokes consent
    const revokeRes = await request(app)
      .delete(`/api/consents/${consentRecord!.id}`)
      .set('Authorization', `Bearer ${patientBToken}`);
    expect(revokeRes.status).toBe(200);

    // Alice attempts to read Bob's data again
    const postRevokeRes = await request(app)
      .get('/api/observations')
      .set('Authorization', `Bearer ${patientAToken}`)
      .set('X-Target-Patient-Id', patientBId);

    expect(postRevokeRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // TEST 5: Idempotency Protection on Care Tasks
  // -------------------------------------------------------------
  test('IDEMPOTENCY: Repeated submission with identical key does not duplicate tasks', async () => {
    const idempotencyKey = `idemp_${Date.now()}_test_task`;

    // First attempt
    const res1 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({
        title: 'Check Fasting Glucose Tomorrow',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey,
      });

    expect(res1.status).toBe(201);
    const originalTaskId = res1.body.task.id;

    // Duplicate attempt (e.g. mobile network retry)
    const res2 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${patientAToken}`)
      .send({
        title: 'Check Fasting Glucose Tomorrow',
        category: 'FOLLOW_UP',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        idempotencyKey,
      });

    expect(res2.status).toBe(200);
    expect(res2.body.task.id).toBe(originalTaskId);

    // Verify database row count
    const totalMatching = await prisma.careTask.count({
      where: { userId: patientAId, idempotencyKey },
    });
    expect(totalMatching).toBe(1);
  });

  // -------------------------------------------------------------
  // TEST 6: Session Expiration & Tampered Token Handling
  // -------------------------------------------------------------
  test('AUTH: Expired or malformed bearer token returns 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', 'Bearer invalid_tampered_token_string');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/token/i);
  });

  // -------------------------------------------------------------
  // TEST 7: ABDM FHIR R4 Bundle Conformance
  // -------------------------------------------------------------
  test('INTEROPERABILITY: /api/fhir/Observation outputs compliant FHIR R4 Bundle', async () => {
    const res = await request(app)
      .get('/api/fhir/Observation')
      .set('Authorization', `Bearer ${patientBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Bundle');
    expect(res.body.type).toBe('searchset');
    expect(Array.isArray(res.body.entry)).toBe(true);

    const firstEntry = res.body.entry[0]?.resource;
    expect(firstEntry).toBeDefined();
    expect(firstEntry.resourceType).toBe('Observation');
    expect(firstEntry.code.coding[0].system).toBe('http://loinc.org');
    expect(firstEntry.code.coding[0].code).toBe('2339-0'); // LOINC Blood Glucose
    expect(firstEntry.valueQuantity.unit).toBe('mg/dL');
    expect(firstEntry.subject.reference).toBe(`Patient/${patientBId}`);
  });
});