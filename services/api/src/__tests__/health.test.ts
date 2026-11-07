import request from 'supertest';
import app, { prisma, isOriginAllowed } from '../server';

describe('health endpoints', () => {
  it('correctly validates allowed and rejected origins', () => {
    // Exact configured origins
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://localhost:8081')).toBe(true);

    // Dynamic dev origins (alternate ports, loopback IP, private LAN)
    expect(isOriginAllowed('http://localhost:5174')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5174')).toBe(true);
    expect(isOriginAllowed('http://192.168.1.100:5173')).toBe(true);
    expect(isOriginAllowed('http://10.0.0.5:8081')).toBe(true);
    expect(isOriginAllowed('http://my-mac.local:8081')).toBe(true);

    // Malicious external origins rejected
    expect(isOriginAllowed('https://malicious-site.com')).toBe(false);
    expect(isOriginAllowed('http://attacker.xyz:5173')).toBe(false);
  });

  it('allows CORS from alternate local dev origins without throwing 500 error', async () => {
    const response = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:5174');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5174');
  });

  it('does not crash with 500 error when receiving unallowed origin', async () => {
    const response = await request(app)
      .get('/health/live')
      .set('Origin', 'https://malicious-site.com');

    // Should return 200 for health endpoint without CORS allow header
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps liveness independent of database readiness', async () => {
    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
  });

  it('reports database readiness without exposing connection details', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ready',
      checks: { database: 'available' },
    });
    expect(JSON.stringify(response.body)).not.toContain('DATABASE_URL');
  });

  it('rejects a client configured for a different environment', async () => {
    const response = await request(app)
      .get('/health/ready')
      .set('X-Aarogyadamu-Environment', 'production');

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('ENVIRONMENT_MISMATCH');
  });

  it('does not report push delivery when only a device token is registered', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'health.push-readiness@aarogyadamu.local',
        passwordHash: 'test-hash',
        devicePushTokens: {
          create: {
            token: 'ExponentPushToken[health-readiness]',
            platform: 'EXPO',
            isActive: true,
          },
        },
        notificationPreference: {
          create: { pushEnabled: true },
        },
      },
    });

    try {
      const { NotificationService } = await import('../services/notificationService');
      const notification = await NotificationService.createCareNotification({
        userId: user.id,
        type: 'HEALTH_READINESS_TEST',
        title: 'Readiness test',
        message: 'Synthetic notification test.',
      });

      expect(notification?.channel).toBe('IN_APP');
      expect(notification?.deliveryStatus).toBe('DELIVERED');
      const stored = await prisma.careNotification.findUnique({
        where: { id: notification?.id },
      });
      expect(stored?.channel).toBe('IN_APP');
      expect(stored?.deliveryStatus).toBe('DELIVERED');

      const pushNotification = await NotificationService.createCareNotification({
        userId: user.id,
        type: 'HEALTH_READINESS_PUSH_TEST',
        title: 'Push readiness test',
        message: 'Synthetic push notification test.',
        channel: 'PUSH',
      });
      expect(pushNotification?.channel).toBe('PUSH');
      expect(pushNotification?.deliveryStatus).toBe('CREATED');
      expect(pushNotification?.deliveredAt).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
