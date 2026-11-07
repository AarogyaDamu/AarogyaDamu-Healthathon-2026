import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext } from '../permissions/evaluator';
import { generateDigitalHealthTwin } from '../services/healthTwinService';

export const healthTwinRouter = Router();

healthTwinRouter.use(requireAuth);
healthTwinRouter.use(requireFeature('P0_3_LIFESTYLE_TWIN'));

/**
 * GET /api/health-twin
 * Generate transparent, read-only Digital Health Twin personal health summary
 */
healthTwinRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
      const twinPayload = await generateDigitalHealthTwin(effectivePatientId);
      res.json(twinPayload);
    } catch (err) {
      next(err);
    }
  }
);
