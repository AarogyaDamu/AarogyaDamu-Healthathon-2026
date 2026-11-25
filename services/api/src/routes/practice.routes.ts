import { Router, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { resolvePracticeContext, requirePracticeMembership, requirePracticeRole, TenantRequest } from '../middleware/tenantMiddleware';
import { PracticeService } from '../services/practiceService';
import { DoctorOnboardingSchema, WorkingHourDaySchema } from '@aarogyadamu/contracts';

const router = Router();

/**
 * Dedicated strict update DTO with an explicit field allow-list.
 * Prevents modification of:
 * - practice ID, tenant identity, slug, owner identity
 * - role, membership, administrative attributes
 * - registrationNumber, council (immutable clinical license identifiers)
 * - subscription, billing, security, or clinical approval fields
 */
export const PracticeProfileUpdateSchema = z.object({
  practiceName: z.string().min(2).max(120).optional(),
  specialty: z.string().min(2).max(100).optional(),
  qualifications: z.string().max(200).optional(),
  address: z.string().min(5).max(255).optional(),
  city: z.string().min(2).max(100).optional(),
  state: z.string().min(2).max(100).optional(),
  postalCode: z.string().regex(/^\d{6}$/, 'Must be a valid 6-digit Indian PIN code').optional(),
  phone: z.string().min(10).max(15).optional(),
  consultationFeeInr: z.number().int().min(0).max(50000).optional(),
  workingDays: z.array(z.string()).min(1).max(7).optional(),
  workingHours: z.array(WorkingHourDaySchema).optional(),
}).strict();

const StaffInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['DOCTOR', 'RECEPTIONIST']).default('RECEPTIONIST'),
}).strict();

// All routes require authenticated session
router.use(requireAuth);

/**
 * GET /api/practice/current
 * Returns the practice profile and membership details of the authenticated doctor or staff.
 */
router.get('/current', resolvePracticeContext, async (req: TenantRequest, res: Response) => {
  try {
    const data = await PracticeService.getDoctorPractice(req.user!.id);
    if (!data) {
      res.json({
        hasPractice: false,
        practice: null,
        message: 'Clinician onboarding required',
      });
      return;
    }

    res.json({
      hasPractice: true,
      membershipId: data.membershipId,
      role: data.role,
      practice: data.practice,
      activeStaffCount: data.activeStaffCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/practice/onboard
 * Onboards clinician and registers their practice profile and owner membership.
 */
router.post('/onboard', async (req: TenantRequest, res: Response) => {
  try {
    const parsed = DoctorOnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
      return;
    }

    const result = await PracticeService.onboardPractice(req.user!.id, parsed.data);
    res.status(201).json({
      success: true,
      message: 'Practice onboarded successfully',
      practice: result.practice,
      membership: result.membership,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/practice/profile
 * Updates clinic settings, consultation fees, and working hours.
 */
router.put(
  '/profile',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response) => {
    try {
      const parsed = PracticeProfileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const updated = await PracticeService.updatePractice(
        req.user!.id,
        req.practiceId!,
        parsed.data,
      );
      res.json({ success: true, practice: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

/**
 * GET /api/practice/staff
 * Lists all staff members in the practice.
 */
router.get(
  '/staff',
  resolvePracticeContext,
  requirePracticeMembership,
  async (req: TenantRequest, res: Response) => {
    try {
      const staff = await PracticeService.listStaff(req.user!.id, req.practiceId!);
      res.json({ success: true, staff });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

/**
 * POST /api/practice/staff
 * Adds a new staff member (e.g. Receptionist) with subscription quota enforcement.
 */
router.post(
  '/staff',
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER']),
  async (req: TenantRequest, res: Response) => {
    try {
      const parsed = StaffInviteSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const membership = await PracticeService.addStaffMember(
        req.user!.id,
        req.practiceId!,
        parsed.data.email,
        parsed.data.role,
      );

      res.status(201).json({
        success: true,
        message: 'Staff member added successfully',
        membership,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

export default router;

