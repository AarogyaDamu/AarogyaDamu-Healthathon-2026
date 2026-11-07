import { Request, Response, NextFunction } from 'express';
import { FeatureFlagKey } from '@aarogyadamu/contracts';
import { isFeatureEnabled } from '../features/featureFlags';
import { randomUUID } from 'crypto';

export function requireFeature(key: FeatureFlagKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const enabled = await isFeatureEnabled(key);
      if (!enabled) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: `Feature '${key}' is currently disabled in this environment.`,
            incidentId: randomUUID(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

