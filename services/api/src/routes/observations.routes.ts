import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolvePatientContext } from '../permissions/evaluator';
import { evaluateClinicalSafety } from '../safety/clinicalSafetyEvaluator';
import { logClinicalAccessEvent, logClinicalMutationEvent } from '../audit/clinicalAuditLogger';

const router = Router();
import { prisma } from '../db/prisma';

function getAuthErrorStatus(err: any): number {
  if (err?.status && typeof err.status === 'number') return err.status;
  if (err?.statusCode && typeof err.statusCode === 'number') return err.statusCode;
  const msg = String(err?.message || '');
  if (msg.includes('Forbidden') || msg.includes('Access denied') || msg.includes('lacks specific permission')) return 403;
  if (msg.includes('Authentication required') || msg.includes('jwt') || msg.includes('token')) return 401;
  return 500;
}

// A. LIST OBSERVATIONS (Paginated, filtered by type, context, and date range)
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 100, 200);
    const typeFilter = req.query.type as string | undefined;
    const contextFilter = req.query.context as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const cursor = req.query.cursor as string | undefined;

    const whereClause: any = { userId: effectivePatientId };
    if (typeFilter && typeFilter !== 'ALL') {
      whereClause.type = typeFilter.toUpperCase();
    }
    if (contextFilter && contextFilter !== 'ALL') {
      whereClause.context = contextFilter.toUpperCase();
    }
    if (startDate || endDate) {
      whereClause.observedAt = {};
      if (startDate) whereClause.observedAt.gte = new Date(startDate);
      if (endDate) whereClause.observedAt.lte = new Date(endDate);
    }

    const [totalCount, observations] = await Promise.all([
      prisma.healthObservation.count({ where: whereClause }),
      prisma.healthObservation.findMany({
        where: whereClause,
        orderBy: { observedAt: 'desc' },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    ]);

    const hasMore = observations.length > limit;
    const resultObservations = hasMore ? observations.slice(0, limit) : observations;

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalAccessEvent({
      userId: effectivePatientId,
      actorId,
      action: 'VIEW_OBSERVATIONS',
      entityType: 'HealthObservation',
      metadata: { count: resultObservations.length, queryLimit: limit, type: typeFilter },
      ipAddress: req.ip,
    });

    res.json({
      observations: resultObservations,
      totalCount,
      hasMore,
      nextCursor: hasMore && resultObservations.length > 0 ? resultObservations[resultObservations.length - 1].id : null,
      pagination: {
        totalCount,
        hasMore,
        limit,
        nextCursor: hasMore && resultObservations.length > 0 ? resultObservations[resultObservations.length - 1].id : null,
      },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// B. AMBULATORY VITAL & GLYCEMIC STATISTICS
router.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const type = ((req.query.type as string) || 'BLOOD_GLUCOSE').toUpperCase();
    const days = Math.max(1, Math.min(parseInt(req.query.days as string, 10) || 14, 365));
    const cutoffDate = new Date(Date.now() - days * 86400000);

    const observations = await prisma.healthObservation.findMany({
      where: {
        userId: effectivePatientId,
        type,
        observedAt: { gte: cutoffDate },
      },
      orderBy: { observedAt: 'desc' },
    });

    const count = observations.length;
    let stats: Record<string, any> = { count, days, type };

    if (count > 0) {
      const values = observations.map((o) => o.numericValue);
      const sum = values.reduce((acc, v) => acc + v, 0);
      const mean = Math.round((sum / count) * 10) / 10;
      const min = Math.min(...values);
      const max = Math.max(...values);

      stats.mean = mean;
      stats.min = min;
      stats.max = max;

      if (type === 'BLOOD_GLUCOSE') {
        const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
        const variance = squaredDiffs.reduce((acc, v) => acc + v, 0) / count;
        const standardDeviation = Math.round(Math.sqrt(variance) * 10) / 10;
        const coefficientOfVariation = mean > 0 ? Math.round((standardDeviation / mean) * 1000) / 10 : 0;

        const veryLow = observations.filter((o) => o.numericValue < 54).length;
        const low = observations.filter((o) => o.numericValue >= 54 && o.numericValue < 70).length;
        const target = observations.filter((o) => o.numericValue >= 70 && o.numericValue <= 180).length;
        const high = observations.filter((o) => o.numericValue > 180 && o.numericValue <= 250).length;
        const veryHigh = observations.filter((o) => o.numericValue > 250).length;

        stats = {
          ...stats,
          standardDeviation,
          coefficientOfVariation,
          timeInRange: {
            veryLow: { count: veryLow, percentage: Math.round((veryLow / count) * 1000) / 10 },
            low: { count: low, percentage: Math.round((low / count) * 1000) / 10 },
            target: { count: target, percentage: Math.round((target / count) * 1000) / 10 },
            high: { count: high, percentage: Math.round((high / count) * 1000) / 10 },
            veryHigh: { count: veryHigh, percentage: Math.round((veryHigh / count) * 1000) / 10 },
          },
        };
      } else if (type === 'BLOOD_PRESSURE') {
        const diastolicValues = observations.filter((o) => o.secondaryValue != null).map((o) => o.secondaryValue as number);
        const meanDiastolic = diastolicValues.length > 0
          ? Math.round((diastolicValues.reduce((acc, v) => acc + v, 0) / diastolicValues.length) * 10) / 10
          : null;

        const normal = observations.filter((o) => o.clinicalFlag === 'NORMAL').length;
        const elevated = observations.filter((o) => o.clinicalFlag === 'ELEVATED').length;
        const stage1 = observations.filter((o) => o.clinicalFlag === 'STAGE_1_HYPERTENSION').length;
        const stage2 = observations.filter((o) => o.clinicalFlag === 'STAGE_2_HYPERTENSION').length;
        const crisis = observations.filter((o) => o.clinicalFlag === 'HYPERTENSIVE_CRISIS').length;

        stats = {
          ...stats,
          meanSystolic: mean,
          meanDiastolic,
          minSystolic: min,
          maxSystolic: max,
          distribution: { normal, elevated, stage1, stage2, crisis, hypertensiveCrisis: crisis },
        };
      } else if (type === 'WEIGHT') {
        const earliest = observations[observations.length - 1].numericValue;
        const latest = observations[0].numericValue;
        stats = {
          ...stats,
          latestWeight: latest,
          earliestWeight: earliest,
          weightDelta: Math.round((latest - earliest) * 10) / 10,
        };
      } else if (type === 'HBA1C') {
        stats = {
          ...stats,
          latestHbA1c: observations[0].numericValue,
          latestFlag: observations[0].clinicalFlag,
        };
      }
    }

    res.json({ type, days, stats });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// C. GET SINGLE OBSERVATION
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const { id } = req.params;

    const observation = await prisma.healthObservation.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!observation) {
      res.status(404).json({ error: `HealthObservation with ID ${id} not found.` });
      return;
    }

    res.json({ observation });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// D. INGEST OBSERVATION (Idempotent, Multi-Vital, Deterministic Safety Evaluated)
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId, isDelegated } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const {
      type,
      numericValue,
      secondaryValue,
      unit,
      context,
      notes,
      observedAt,
      provenance,
      sourceProvenance,
      deviceModel,
      idempotencyKey,
    } = req.body;

    const actorId = (req as any).user?.id || effectivePatientId;
    const isClinician = Boolean((req as any).user?.isClinician);

    // Idempotency verification
    if (idempotencyKey) {
      const existing = await prisma.healthObservation.findUnique({
        where: { idempotencyKey: String(idempotencyKey) },
      });
      if (existing) {
        res.status(200).json({
          observation: existing,
          isIdempotentReplay: true,
          replayed: true,
        });
        return;
      }
    }

    const obsType = (type || 'BLOOD_GLUCOSE').toUpperCase();
    const ALLOWED_TYPES = ['BLOOD_GLUCOSE', 'BLOOD_PRESSURE', 'WEIGHT', 'HBA1C'];
    if (!ALLOWED_TYPES.includes(obsType)) {
      res.status(400).json({ error: 'Unsupported observation type. Must be BLOOD_GLUCOSE, BLOOD_PRESSURE, WEIGHT, or HBA1C.' });
      return;
    }

    const numVal = Number(numericValue);
    if (isNaN(numVal) || numVal <= 0) {
      res.status(400).json({ error: 'Reading must be a positive number.' });
      return;
    }

    const secVal = secondaryValue !== undefined && secondaryValue !== null ? Number(secondaryValue) : undefined;
    if (secVal !== undefined && (isNaN(secVal) || secVal <= 0)) {
      res.status(400).json({ error: 'Secondary reading must be a positive number.' });
      return;
    }

    // Default units per vital type
    let defaultUnit = 'mg/dL';
    if (obsType === 'BLOOD_PRESSURE') defaultUnit = 'mmHg';
    else if (obsType === 'WEIGHT') defaultUnit = 'kg';
    else if (obsType === 'HBA1C') defaultUnit = '%';

    // Default context per vital type
    let defaultContext = 'FASTING';
    if (obsType === 'BLOOD_PRESSURE' || obsType === 'WEIGHT' || obsType === 'HBA1C') defaultContext = 'GENERAL';

    const obsContext = (context || defaultContext).toUpperCase();

    // Provenance resolution
    let resolvedSource = sourceProvenance;
    if (!resolvedSource) {
      if (isClinician) {
        resolvedSource = 'DOCTOR_CLINICAL';
      } else if (isDelegated) {
        resolvedSource = 'CAREGIVER_INPUT';
      } else {
        resolvedSource = 'MANUAL_PATIENT';
      }
    }

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: effectivePatientId },
      select: {
        targetFastingMin: true,
        targetFastingMax: true,
        targetPostMealMax: true,
      },
    });

    // Clinical Safety Evaluation (Deterministic ADA / ACC-AHA Criteria)
    const safetyEvaluation = evaluateClinicalSafety({
      type: obsType,
      numericValue: numVal,
      secondaryValue: secVal,
      context: obsContext,
      clinicalContext: {
        hasSevereSymptoms: Boolean(req.body.hasSevereSymptoms),
        requiresAssistance: Boolean(req.body.requiresAssistance),
        isRepeatMeasurement: Boolean(req.body.isRepeatMeasurement),
        symptoms: Array.isArray(req.body.symptoms) ? req.body.symptoms : undefined,
      },
      individualizedTargets: profile
        ? {
            targetFastingMin: profile.targetFastingMin,
            targetFastingMax: profile.targetFastingMax,
            targetPostMealMax: profile.targetPostMealMax,
          }
        : undefined,
    });

    const obs = await prisma.healthObservation.create({
      data: {
        userId: effectivePatientId,
        type: obsType,
        numericValue: numVal,
        secondaryValue: secVal,
        unit: unit || defaultUnit,
        context: obsContext,
        clinicalFlag: safetyEvaluation.clinicalFlag,
        notes: notes || undefined,
        observedAt: observedAt ? new Date(observedAt) : new Date(),
        provenance: provenance || (isClinician ? 'DOCTOR_ENTERED' : isDelegated ? 'CAREGIVER_ENTERED' : 'PATIENT_ENTERED'),
        sourceProvenance: resolvedSource,
        deviceModel: deviceModel || undefined,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      },
    });

    void logClinicalMutationEvent({
      userId: effectivePatientId,
      actorId,
      action: 'OBSERVATION_CREATED',
      entityType: 'HealthObservation',
      entityId: obs.id,
      after: {
        type: obs.type,
        numericValue: obs.numericValue,
        secondaryValue: obs.secondaryValue,
        clinicalFlag: obs.clinicalFlag,
        sourceProvenance: obs.sourceProvenance,
      },
      metadata: {
        safetyEvaluation,
        deviceModel: obs.deviceModel,
        isCritical: safetyEvaluation.isCritical,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({
      observation: obs,
      safetyEvaluation,
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// E. AMEND / CORRECT OBSERVATION (Audited clinical correction)
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
    const { id } = req.params;
    const { numericValue, secondaryValue, notes, reasonForCorrection } = req.body;

    if (!reasonForCorrection || String(reasonForCorrection).trim().length < 2) {
      res.status(400).json({ error: 'A valid reasonForCorrection (at least 2 characters) is mandatory to amend clinical records.' });
      return;
    }

    const existing = await prisma.healthObservation.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!existing) {
      res.status(404).json({ error: `HealthObservation with ID ${id} not found for this patient.` });
      return;
    }

    let updatedNumVal = existing.numericValue;
    if (numericValue !== undefined && numericValue !== null) {
      const parsed = Number(numericValue);
      if (isNaN(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'Reading must be a positive number.' });
        return;
      }
      updatedNumVal = parsed;
    }

    let updatedSecVal = existing.secondaryValue;
    if (secondaryValue !== undefined && secondaryValue !== null) {
      const parsed = Number(secondaryValue);
      if (isNaN(parsed) || parsed <= 0) {
        res.status(400).json({ error: 'Secondary reading must be a positive number.' });
        return;
      }
      updatedSecVal = parsed;
    }

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: effectivePatientId },
      select: { targetFastingMin: true, targetFastingMax: true, targetPostMealMax: true },
    });

    const safetyEvaluation = evaluateClinicalSafety({
      type: existing.type,
      numericValue: updatedNumVal,
      secondaryValue: updatedSecVal,
      context: existing.context,
      individualizedTargets: profile
        ? {
            targetFastingMin: profile.targetFastingMin,
            targetFastingMax: profile.targetFastingMax,
            targetPostMealMax: profile.targetPostMealMax,
          }
        : undefined,
    });

    const amended = await prisma.healthObservation.update({
      where: { id: existing.id },
      data: {
        numericValue: updatedNumVal,
        secondaryValue: updatedSecVal,
        clinicalFlag: safetyEvaluation.clinicalFlag,
        notes: notes !== undefined ? notes : existing.notes,
      },
    });

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalMutationEvent({
      userId: effectivePatientId,
      actorId,
      action: 'OBSERVATION_AMENDED',
      entityType: 'HealthObservation',
      entityId: amended.id,
      before: {
        numericValue: existing.numericValue,
        secondaryValue: existing.secondaryValue,
        clinicalFlag: existing.clinicalFlag,
        notes: existing.notes,
      },
      after: {
        numericValue: amended.numericValue,
        secondaryValue: amended.secondaryValue,
        clinicalFlag: amended.clinicalFlag,
        notes: amended.notes,
      },
      metadata: {
        reasonForCorrection: String(reasonForCorrection).trim(),
        safetyEvaluation,
      },
      ipAddress: req.ip,
    });

    res.json({
      observation: amended,
      safetyEvaluation,
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

export default router;
