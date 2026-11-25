import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { resolvePracticeContext, requirePracticeMembership, requirePracticeRole, TenantRequest } from '../middleware/tenantMiddleware';
import { PracticeBillingService } from '../services/practiceBillingService';
import {
  PatientEncounterBillingSchema,
  EncounterBillingStatusUpdateSchema,
} from '@aarogyadamu/contracts';

const router = Router();

router.use(requireAuth);

/**
 * PATCH /api/billing/encounters/:id/status
 * Transitions billing payment status (PENDING -> PAID, PENDING -> CANCELLED, PAID -> REFUNDED).
 */
const handleStatusTransition = async (req: TenantRequest, res: Response) => {
  try {
    const parsed = EncounterBillingStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      return;
    }

    const billingId = req.params.id;
    const updated = await PracticeBillingService.transitionBillingStatus(
      req.user!.id,
      req.practiceId!,
      billingId,
      parsed.data,
    );

    res.json({
      success: true,
      message: `Encounter billing status updated to ${parsed.data.paymentStatus}`,
      billing: updated,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

router.patch(
  '/encounters/:id/status',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR', 'RECEPTIONIST']),
  handleStatusTransition,
);

router.patch(
  '/:id/status',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR', 'RECEPTIONIST']),
  handleStatusTransition,
);

/**
 * POST /api/billing/encounters
 * Records consultation payment and generates encounter receipt.
 * Allowed for Doctors and Receptionist staff.
 */
router.post(
  '/encounters',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR', 'RECEPTIONIST']),
  async (req: TenantRequest, res: Response) => {
    try {
      const parsed = PatientEncounterBillingSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const billing = await PracticeBillingService.recordEncounterBilling(
        req.user!.id,
        req.practiceId!,
        parsed.data,
      );

      res.status(201).json({
        success: true,
        message: 'Encounter payment recorded and receipt generated',
        billing,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

/**
 * GET /api/billing/daily-collections
 * Returns daily revenue summary, collection by payment method, and dues.
 */
router.get(
  '/daily-collections',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR', 'RECEPTIONIST']),
  async (req: TenantRequest, res: Response) => {
    try {
      const dateStr = typeof req.query.date === 'string' ? req.query.date : undefined;
      const summary = await PracticeBillingService.getDailyCollections(req.practiceId!, dateStr);
      res.json({ success: true, summary });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

/**
 * GET /api/billing/encounters
 * Lists encounter billings for the practice.
 */
router.get(
  '/encounters',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR', 'RECEPTIONIST']),
  async (req: TenantRequest, res: Response) => {
    try {
      const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
      const paymentStatus = typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : undefined;

      const billings = await PracticeBillingService.listBillings(req.practiceId!, {
        patientId,
        paymentStatus,
      });

      res.json({ success: true, billings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

export default router;

