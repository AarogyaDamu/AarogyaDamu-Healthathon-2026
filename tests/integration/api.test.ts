import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
const { assertSafeTestDatabase } = require('../../services/api/scripts/test-db-guard.cjs');
assertSafeTestDatabase();
import { app, prisma } from '../../services/api/src/server';

describe('AarogyaDamu Project 3 Integration Tests', () => {
  let token1 = '';
  let user1Id = '';
  let token2 = '';
  let doctorToken = '';
  let task1Id = '';

  beforeAll(async () => {
    const p1 = await request(app).post('/api/auth/register').send({
      email: `p1.${Date.now()}@test.local`,
      password: 'Password123!',
      fullName: 'Patient One',
    });
    token1 = p1.body.token;
    user1Id = p1.body.user.id;

    const p2 = await request(app).post('/api/auth/register').send({
      email: `p2.${Date.now()}@test.local`,
      password: 'Password123!',
      fullName: 'Patient Two',
    });
    token2 = p2.body.token;

    const docUser = await prisma.user.create({
      data: {
        email: `doc.${Date.now()}@test.local`,
        passwordHash: await bcrypt.hash('Password123!', 10),
        isClinician: true,
        profile: {
          create: {
            fullName: 'Dr. Integration Clinician',
          },
        },
      },
    });
    const docLogin = await request(app).post('/api/auth/login').send({
      email: docUser.email,
      password: 'Password123!',
    });
    doctorToken = docLogin.body.token;

    await prisma.doctorPatientAssignment.create({
      data: {
        doctorId: docUser.id,
        patientId: user1Id,
        status: 'ACTIVE',
      },
    });
  });

  it('records health observation and queries timeline', async () => {
    const res = await request(app)
      .post('/api/observations')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        type: 'BLOOD_GLUCOSE',
        numericValue: 125,
        unit: 'mg/dL',
        context: 'FASTING',
        observedAt: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
  });

  it('isolates patient tasks strictly and enforces clinical role boundaries', async () => {
    // 1. Patient cannot create tasks directly
    const patientCreate = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        title: 'Check blood glucose',
        category: 'FOLLOW_UP',
        dueAt: new Date().toISOString(),
      });
    expect(patientCreate.status).toBe(403);

    // 2. Doctor assigns task to Patient 1
    const create = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientId: user1Id,
        title: 'Check blood glucose',
        category: 'FOLLOW_UP',
        dueAt: new Date().toISOString(),
      });
    expect(create.status).toBe(201);
    task1Id = create.body.task.id;

    // 3. Patient 2 cannot complete Patient 1's task
    const forbidden = await request(app)
      .post(`/api/tasks/${task1Id}/complete`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ notes: 'Cross-patient attempt' });
    expect(forbidden.status).toBe(403);
  });
});
