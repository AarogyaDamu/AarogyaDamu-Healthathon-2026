import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest, AuthTokenPayload } from '../middleware/auth';
import { updateTenantContext } from '../db/tenantContext';
import { prisma } from '../db/prisma';
import { ClinicalReviewService } from '../services/clinicalReviewService';
import {
  UpdateChecklistItemInputSchema,
  FinalizeDoctorApprovalInputSchema,
} from '@aarogyadamu/contracts';

const router = Router();
router.use(requireAuth);

function getActor(req: Request): AuthTokenPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new Error('Authentication required');
  return user;
}

// 1. GET /api/clinical-review/active/:patientId
router.get('/active/:patientId', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { patientId } = req.params;

    if (!actor.isClinician && actor.id !== patientId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    updateTenantContext({ patientId });

    // Get doctor practice ID
    const membership = await prisma.practiceMembership.findFirst({
      where: { userId: actor.id, isActive: true },
    });
    const practiceId = membership?.practiceId || 'cedf16cd-dbb8-41cb-80d9-bee4d2d85e70';

    const encounter = await ClinicalReviewService.getOrCreateEncounter(patientId, practiceId);
    res.json({ success: true, encounter });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. PATCH /api/clinical-review/:id/item
router.patch('/:id/item', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Only authorized clinical personnel can review checklist items' });
      return;
    }

    const { id } = req.params;
    const input = UpdateChecklistItemInputSchema.parse(req.body);

    const docUser = await prisma.user.findUnique({
      where: { id: actor.id },
      include: { profile: true },
    });
    const reviewerName = docUser?.profile?.fullName || actor.email;
    const reviewerRole = actor.isClinician ? 'DOCTOR' : 'CLINICIAN';

    const updated = await ClinicalReviewService.updateChecklistItem(
      id,
      actor.id,
      reviewerRole,
      reviewerName,
      input.itemKey,
      input.status,
      input.clinicalNotes,
      input.needsAttentionReason,
    );

    res.json({ success: true, encounter: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. POST /api/clinical-review/:id/submit-to-doctor
router.post('/:id/submit-to-doctor', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    await ClinicalReviewService.submitToDoctor(id, actor.id);

    res.json({ success: true, message: 'Checklist submitted to attending physician for final approval.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. POST /api/clinical-review/:id/finalize-doctor-approval
router.post('/:id/finalize-doctor-approval', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Only a licensed physician can provide final clinical sign-off' });
      return;
    }

    const { id } = req.params;
    const input = FinalizeDoctorApprovalInputSchema.parse(req.body);

    const docUser = await prisma.user.findUnique({
      where: { id: actor.id },
      include: { profile: true },
    });
    const doctorName = docUser?.profile?.fullName || actor.email;

    await ClinicalReviewService.finalizeDoctorApproval(
      id,
      actor.id,
      doctorName,
      input.clinicalSummaryNote,
      input.signatureText,
    );

    res.json({
      success: true,
      message: 'Clinical Review successfully finalized, digitally signed, and committed to patient record.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 5. POST /api/clinical-review/:id/request-corrections
const requestCorrectionsSchema = z.object({
  correctionNotes: z.string().trim().min(5).max(1000),
});

router.post('/:id/request-corrections', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { id } = req.params;
    const { correctionNotes } = requestCorrectionsSchema.parse(req.body);

    await ClinicalReviewService.requestCorrections(id, actor.id, correctionNotes);

    res.json({ success: true, message: 'Review returned to clinical team for clarification.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

