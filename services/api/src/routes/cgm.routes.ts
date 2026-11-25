import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest, AuthTokenPayload } from '../middleware/auth';
import { updateTenantContext } from '../db/tenantContext';
import { prisma } from '../db/prisma';
import { CgmService } from '../services/cgmService';
import {
  ConnectCgmDeviceInputSchema,
  CgmTargetSettingsSchema,
} from '@aarogyadamu/contracts';

const router = Router();
router.use(requireAuth);

function getActor(req: Request): AuthTokenPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new Error('Authentication required');
  return user;
}

async function resolveTargetPatientId(req: Request, targetId?: string): Promise<string> {
  const actor = getActor(req);
  if (!actor) throw new Error('Authentication required');

  if (!actor.isClinician) {
    return actor.id;
  }

  // If clinician, targetId must be an active assigned patient
  const patientId = targetId || (req.query.patientId as string) || (req.headers['x-target-patient-id'] as string);
  if (!patientId) {
    throw new Error('Patient ID is required for clinician request');
  }

  const assignment = await prisma.doctorPatientAssignment.findFirst({
    where: { doctorId: actor.id, patientId, status: 'ACTIVE' },
  });

  if (!assignment) {
    // Also check practice membership
    const practiceDoctors = await prisma.practiceMembership.findMany({
      where: { userId: actor.id, isActive: true },
    });
    if (practiceDoctors.length === 0) {
      throw new Error('Forbidden: Clinician is not assigned to this patient');
    }
  }

  return patientId;
}

// 1. GET /api/cgm/devices
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    // Seed demo data if this is the first visit for demo
    await CgmService.seedDemoCgmDataIfEmpty(patientId);

    const devices = await prisma.cgmDeviceConnection.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, devices });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 400).json({ error: err.message });
  }
});

// 2. POST /api/cgm/devices/connect
router.post('/devices/connect', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    const input = ConnectCgmDeviceInputSchema.parse(req.body);

    const device = await prisma.cgmDeviceConnection.create({
      data: {
        patientId,
        provider: input.provider,
        deviceName: input.deviceName,
        deviceModel: input.deviceModel || null,
        serialNumber: input.serialNumber || `SN-${Date.now().toString().slice(-6)}`,
        connectionStatus: 'CONNECTED',
        lastSyncAt: new Date(),
        metadataJson: JSON.stringify({
          connectedVia: 'AUTHORISED_INTEGRATION_PARTNER',
          firmware: '3.1.0',
        }),
      },
    });

    res.status(201).json({ success: true, device });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. POST /api/cgm/devices/:id/disconnect
router.post('/devices/:id/disconnect', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { id } = req.params;

    const device = await prisma.cgmDeviceConnection.findUnique({ where: { id } });
    if (!device) {
      res.status(404).json({ error: 'Device connection not found' });
      return;
    }

    if (device.patientId !== actor.id && !actor.isClinician) {
      res.status(403).json({ error: 'Unauthorized to modify this device connection' });
      return;
    }

    const updated = await prisma.cgmDeviceConnection.update({
      where: { id },
      data: {
        connectionStatus: 'REVOKED',
        sharingConsentRevokedAt: new Date(),
      },
    });

    res.json({ success: true, device: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. POST /api/cgm/upload-csv
const uploadCsvSchema = z.object({
  csvContent: z.string().min(10),
  deviceConnectionId: z.string().uuid().optional(),
});

router.post('/upload-csv', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    const { csvContent, deviceConnectionId } = uploadCsvSchema.parse(req.body);

    const parsed = CgmService.parseCgmCsv(csvContent);
    if (parsed.length === 0) {
      res.status(400).json({ error: 'No valid glucose readings could be parsed from the provided CSV file.' });
      return;
    }

    const readings = parsed.map((p) => ({
      glucoseValue: p.glucoseValue,
      unit: p.unit,
      observedAt: new Date(p.timestamp),
      trendArrow: p.trendArrow,
      deviceConnectionId,
    }));

    const result = await CgmService.ingestReadings(patientId, readings);

    res.status(201).json({
      success: true,
      message: `Successfully processed ${parsed.length} readings (${result.ingestedCount} newly ingested, ${result.duplicateCount} existing duplicates avoided).`,
      result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. GET /api/cgm/readings
router.get('/readings', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    await CgmService.seedDemoCgmDataIfEmpty(patientId);

    const timeframe = (req.query.timeframe as string) || '14d';
    let days = 14;
    if (timeframe === '24h') days = 1;
    else if (timeframe === '7d') days = 7;
    else if (timeframe === '30d') days = 30;
    else if (timeframe === '90d') days = 90;

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - days * 86400000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const readings = await prisma.cgmGlucoseReading.findMany({
      where: {
        patientId,
        observedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { observedAt: 'asc' },
      take: 1000,
    });

    res.json({
      success: true,
      patientId,
      timeframe,
      count: readings.length,
      readings: readings.map((r) => ({
        id: r.id,
        glucoseValueMgDl: r.glucoseValueMgDl,
        glucoseValueMmolL: r.glucoseValueMmolL,
        trendArrow: r.trendArrow,
        observedAt: r.observedAt.toISOString(),
        quality: r.dataQualityStatus,
      })),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. GET /api/cgm/metrics
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    await CgmService.seedDemoCgmDataIfEmpty(patientId);

    const timeframe = (req.query.timeframe as any) || '14d';
    const targetType = (req.query.targetType as any) || 'STANDARD_T2D';

    const metrics = await CgmService.computeMetrics(patientId, timeframe, undefined, {
      targetType,
    });

    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 7. GET /api/cgm/fhir/observations
router.get('/fhir/observations', async (req: Request, res: Response) => {
  try {
    const patientId = await resolveTargetPatientId(req);
    updateTenantContext({ patientId });

    const limit = Math.min(100, parseInt((req.query.limit as string) || '50', 10));

    const readings = await prisma.cgmGlucoseReading.findMany({
      where: { patientId, dataQualityStatus: 'VALID' },
      orderBy: { observedAt: 'desc' },
      take: limit,
    });

    const bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: readings.length,
      entry: readings.map((r) => ({
        fullUrl: `urn:uuid:${r.id}`,
        resource: CgmService.toFhirR4Observation(r),
      })),
    };

    res.json(bundle);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

