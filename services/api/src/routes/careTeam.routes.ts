import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest, AuthTokenPayload } from '../middleware/auth';
import { updateTenantContext } from '../db/tenantContext';
import { CareTeamService } from '../services/careTeamService';
import { AddCareTeamMemberInputSchema } from '@aarogyadamu/contracts';

const router = Router();
router.use(requireAuth);

function getActor(req: Request): AuthTokenPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new Error('Authentication required');
  return user;
}

// 1. GET /api/coordination/care-team/:patientId
router.get('/:patientId', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { patientId } = req.params;

    if (!actor.isClinician && actor.id !== patientId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    updateTenantContext({ patientId });

    const members = await CareTeamService.getCareTeam(patientId);
    res.json({ success: true, members });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2. POST /api/coordination/care-team/:patientId/members
router.post('/:patientId/members', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Only attending doctors can add members to the patient care team' });
      return;
    }

    const { patientId } = req.params;
    const input = AddCareTeamMemberInputSchema.parse(req.body);

    updateTenantContext({ patientId });

    const member = await CareTeamService.addMember(
      patientId,
      actor.id,
      input.role,
      input.userId,
      input.email,
    );

    res.status(201).json({ success: true, member });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. DELETE /api/coordination/care-team/:patientId/members/:memberId
router.delete('/:patientId/members/:memberId', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { patientId, memberId } = req.params;
    updateTenantContext({ patientId });

    await CareTeamService.removeMember(patientId, memberId);
    res.json({ success: true, message: 'Care team member removed' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;

