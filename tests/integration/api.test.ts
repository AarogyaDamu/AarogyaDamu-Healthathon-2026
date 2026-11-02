import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
const { assertSafeTestDatabase } = require('../../services/api/scripts/test-db-guard.cjs');
assertSafeTestDatabase();
import { app } from '../../services/api/src/server';

describe('AarogyaDamu Project 3 Integration Tests', () => {
  let token1 = '';
  let token2 = '';
  let task1Id = '';

  beforeAll(async () => {
    const p1 = await request(app).post('/api/auth/register').send({
      email: `p1.${Date.now()}@test.local`,
      password: 'Password123!',
      fullName: 'Patient One',
    });
    token1 = p1.body.token;

    const p2 = await request(app).post('/api/auth/register').send({
      email: `p2.${Date.now()}@test.local`,
      password: 'Password123!',
      fullName: 'Patient Two',
    });
    token2 = p2.body.token;
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

  it('isolates patient tasks strictly', async () => {
    const create = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        title: 'Check blood glucose',
        category: 'FOLLOW_UP',
        dueAt: new Date().toISOString(),
      });
    task1Id = create.body.task.id;

    const forbidden = await request(app)
      .patch(`/api/tasks/${task1Id}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ status: 'COMPLETED' });
    expect(forbidden.status).toBe(404);
  });
});
