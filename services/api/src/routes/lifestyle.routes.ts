import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext } from '../permissions/evaluator';
import {
  LifestyleCreateSchema,
  LifestyleUpdateSchema,
  LifestyleQuerySchema,
} from '@aarogyadamu/contracts';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';

import { prisma } from '../db/prisma';
export const lifestyleRouter = Router();

lifestyleRouter.use(requireAuth);
lifestyleRouter.use(requireFeature('P0_3_LIFESTYLE_TWIN'));

/**
 * GET /api/lifestyle/stats
 * Aggregate lifestyle metrics (7-day / 14-day)
 */
lifestyleRouter.get(
  '/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_LIFESTYLE');
      const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
      if (!Number.isInteger(days) || days < 1 || days > 90) {
        return res.status(400).json({ error: 'days must be an integer between 1 and 90' });
      }
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const records = await prisma.lifestyleRecord.findMany({
        where: {
          userId: effectivePatientId,
          recordedAt: { gte: sinceDate },
        },
        orderBy: { recordedAt: 'desc' },
      });

      const activity = records.filter((r) => r.category === 'PHYSICAL_ACTIVITY');
      const sleep = records.filter((r) => r.category === 'SLEEP');
      const hydration = records.filter((r) => r.category === 'HYDRATION');

      const totalActivityMins = activity.reduce((sum, r) => sum + (r.numericValue || 0), 0);
      const avgSleep = sleep.length > 0
        ? Math.round((sleep.reduce((sum, r) => sum + (r.numericValue || 0), 0) / sleep.length) * 10) / 10
        : null;
      const avgHydration = hydration.length > 0
        ? Math.round(hydration.reduce((sum, r) => sum + (r.numericValue || 0), 0) / hydration.length)
        : null;

      res.json({
        periodDays: days,
        totalRecords: records.length,
        physicalActivity: {
          totalMinutes: totalActivityMins,
          sessionsCount: activity.length,
        },
        sleep: {
          averageHoursPerNight: avgSleep,
          nightsCount: sleep.length,
        },
        hydration: {
          dailyAverageMl: avgHydration,
          entriesCount: hydration.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/lifestyle
 * List lifestyle records
 */
lifestyleRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_LIFESTYLE');
      const queryParsed = LifestyleQuerySchema.safeParse(req.query);
      if (!queryParsed.success) {
        return res.status(400).json({ error: 'Invalid query parameters', details: queryParsed.error.issues });
      }

      const { category, startDate, endDate, limit } = queryParsed.data;

      const where: any = { userId: effectivePatientId };
      if (category) where.category = category;
      if (startDate || endDate) {
        where.recordedAt = {};
        if (startDate) where.recordedAt.gte = new Date(startDate);
        if (endDate) where.recordedAt.lte = new Date(endDate);
      }

      const records = await prisma.lifestyleRecord.findMany({
        where,
        orderBy: { recordedAt: 'desc' },
        take: limit,
      });

      res.json({ records });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/lifestyle/:id
 * Retrieve a specific lifestyle entry
 */
lifestyleRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_LIFESTYLE');
      const record = await prisma.lifestyleRecord.findUnique({
        where: { id: req.params.id },
      });

      if (!record || record.userId !== effectivePatientId) {
        return res.status(404).json({ error: 'Lifestyle record not found' });
      }

      res.json({ record });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/lifestyle
 * Log a new lifestyle entry
 */
lifestyleRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_LIFESTYLE');
      const parseResult = LifestyleCreateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Invalid lifestyle payload', details: parseResult.error.issues });
      }

      const data = parseResult.data;
      const authenticatedUser = (req as any).user;

      // Validate numeric value ranges per category
      if (data.numericValue !== undefined && data.numericValue !== null) {
        if (data.numericValue < 0) {
          return res.status(400).json({ error: 'Measurement value cannot be negative' });
        }
        if (data.category === 'SLEEP' && data.numericValue > 24) {
          return res.status(400).json({ error: 'Sleep duration cannot exceed 24 hours per entry' });
        }
      }

      // Idempotency replay check
      if (data.idempotencyKey) {
        const existing = await prisma.lifestyleRecord.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
        });
        if (existing) {
          return res.status(200).json({ record: existing, isIdempotentReplay: true });
        }
      }

      // Determine provenance
      let source = 'MANUAL_PATIENT';
      if (authenticatedUser?.isClinician) {
        source = 'DOCTOR_CLINICAL';
      } else if (authenticatedUser?.id !== effectivePatientId) {
        source = 'CAREGIVER_INPUT';
      }

      const record = await prisma.lifestyleRecord.create({
        data: {
          userId: effectivePatientId,
          category: data.category,
          numericValue: data.numericValue,
          unit: data.unit,
          qualitativeValue: data.qualitativeValue,
          notes: data.notes,
          recordedAt: data.recordedAt ? new Date(data.recordedAt) : new Date(),
          timezone: data.timezone,
          source,
          createdById: authenticatedUser.id,
          idempotencyKey: data.idempotencyKey,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: effectivePatientId,
          actorId: authenticatedUser.id,
          action: 'CREATE',
          entityType: 'LifestyleRecord',
          entityId: record.id,
          metadata: JSON.stringify({
            category: record.category,
            source: record.source,
            createdById: authenticatedUser.id,
          }),
        },
      });

      safeClinicalLog('info', `Lifestyle entry recorded: ${record.category}`, {
        recordId: record.id,
        category: record.category,
        userId: effectivePatientId,
        source: record.source,
      });

      res.status(201).json({ record });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/lifestyle/:id
 * Correct/edit an existing lifestyle entry with audit trail
 */
lifestyleRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_LIFESTYLE');
      const parseResult = LifestyleUpdateSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Invalid update payload', details: parseResult.error.issues });
      }

      const data = parseResult.data;
      const authenticatedUser = (req as any).user;

      const existing = await prisma.lifestyleRecord.findUnique({
        where: { id: req.params.id },
      });

      if (!existing || existing.userId !== effectivePatientId) {
        return res.status(404).json({ error: 'Lifestyle record not found' });
      }

      if (data.numericValue !== undefined && data.numericValue !== null) {
        if (data.numericValue < 0) {
          return res.status(400).json({ error: 'Measurement value cannot be negative' });
        }
        if (existing.category === 'SLEEP' && data.numericValue > 24) {
          return res.status(400).json({ error: 'Sleep duration cannot exceed 24 hours per entry' });
        }
      }

      const updated = await prisma.lifestyleRecord.update({
        where: { id: existing.id },
        data: {
          numericValue: data.numericValue !== undefined ? data.numericValue : existing.numericValue,
          unit: data.unit !== undefined ? data.unit : existing.unit,
          qualitativeValue: data.qualitativeValue !== undefined ? data.qualitativeValue : existing.qualitativeValue,
          notes: data.notes !== undefined ? data.notes : existing.notes,
          reasonForCorrection: data.reasonForCorrection,
        },
      });

      // Audit correction diff
      await prisma.auditLog.create({
        data: {
          userId: effectivePatientId,
          actorId: authenticatedUser.id,
          action: 'AMEND',
          entityType: 'LifestyleRecord',
          entityId: updated.id,
          metadata: JSON.stringify({
            recordId: updated.id,
            reason: data.reasonForCorrection,
            before: {
              numericValue: existing.numericValue,
              qualitativeValue: existing.qualitativeValue,
              notes: existing.notes,
            },
            after: {
              numericValue: updated.numericValue,
              qualitativeValue: updated.qualitativeValue,
              notes: updated.notes,
            },
            updatedById: authenticatedUser.id,
          }),
        },
      });

      res.json({ record: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/lifestyle/:id
 * Remove a lifestyle record with audit trail
 */
lifestyleRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_LIFESTYLE');
      const authenticatedUser = (req as any).user;

      const existing = await prisma.lifestyleRecord.findUnique({
        where: { id: req.params.id },
      });

      if (!existing || existing.userId !== effectivePatientId) {
        return res.status(404).json({ error: 'Lifestyle record not found' });
      }

      await prisma.auditLog.create({
        data: {
          userId: effectivePatientId,
          actorId: authenticatedUser.id,
          action: 'DELETE',
          entityType: 'LifestyleRecord',
          entityId: existing.id,
          metadata: JSON.stringify({
            recordId: existing.id,
            category: existing.category,
            deletedById: authenticatedUser.id,
          }),
        },
      });

      await prisma.lifestyleRecord.delete({
        where: { id: existing.id },
      });

      res.json({ success: true, message: 'Record deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
);
