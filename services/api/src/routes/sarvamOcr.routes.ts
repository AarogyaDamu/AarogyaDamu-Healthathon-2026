import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest, AuthTokenPayload } from '../middleware/auth';
import { resolvePracticeContext } from '../middleware/tenantMiddleware';
import { updateTenantContext, runWithTenantContext } from '../db/tenantContext';
import { prisma } from '../db/prisma';
import { SarvamOcrService } from '../services/sarvamOcrService';
import { readPrivateFile } from '../services/storageService';
import { ReviewOcrJobInputSchema } from '@aarogyadamu/contracts';

const router = Router();
router.use(requireAuth);
router.use(resolvePracticeContext);

function getActor(req: Request): AuthTokenPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new Error('Authentication required');
  return user;
}

// 1. POST /api/ocr/process-document
const processDocSchema = z.object({
  documentId: z.string().uuid(),
});

router.post('/process-document', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { documentId } = processDocSchema.parse(req.body);
    const targetPatientHeader =
      typeof req.headers['x-target-patient-id'] === 'string'
        ? req.headers['x-target-patient-id'].trim()
        : undefined;
    if (targetPatientHeader) {
      updateTenantContext({ patientId: targetPatientHeader });
    }

    const doc = await prisma.healthDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.userId !== actor.id) {
      if (!actor.isClinician) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const assignment = await prisma.doctorPatientAssignment.findFirst({
        where: { doctorId: actor.id, patientId: doc.userId, status: 'ACTIVE' },
      });
      const careTeamMember = assignment
        ? null
        : await prisma.patientCareTeamMember.findFirst({
            where: { patientId: doc.userId, userId: actor.id, status: 'ACTIVE' },
          });
      if (!assignment && !careTeamMember) {
        res.status(403).json({ error: 'Forbidden: Clinician is not assigned to patient' });
        return;
      }
    }

    const storedFile = await readPrivateFile(doc.storagePath);

    const { result, updatedDoc } = await runWithTenantContext(
      { userId: actor.id, patientId: doc.userId },
      async () => {
        const ocrResult = await SarvamOcrService.processDocument(
          doc.id,
          doc.userId,
          doc.storagePath || undefined,
          storedFile?.buffer,
          doc.mimeType || 'application/pdf',
        );
        const refreshed = await prisma.healthDocument.findUnique({
          where: { id: doc.id },
        });
        return { result: ocrResult, updatedDoc: refreshed };
      },
    );

    let parsedExtracted: any = null;
    try {
      parsedExtracted = updatedDoc?.extractedData ? JSON.parse(updatedDoc.extractedData) : null;
    } catch {}

    res.status(202).json({
      success: true,
      message: 'Document OCR processing completed',
      jobId: result.jobId,
      status: result.status,
      documentType: result.documentType,
      engine: result.engine,
      document: updatedDoc
        ? {
            id: updatedDoc.id,
            title: updatedDoc.title,
            category: updatedDoc.category,
            issuingFacility: updatedDoc.issuingFacility,
            reportDate: updatedDoc.reportDate,
            notes: updatedDoc.notes,
            processingStatus: updatedDoc.processingStatus,
            ocrStatus: updatedDoc.processingStatus,
            doctorReviewStatus: parsedExtracted?.doctorReviewStatus || 'PENDING',
            extractedData: parsedExtracted,
            fileSizeBytes: updatedDoc.fileSizeBytes,
            mimeType: updatedDoc.mimeType,
            hasOriginalFile: Boolean(updatedDoc.storagePath),
            createdAt: updatedDoc.createdAt,
          }
        : undefined,
    });
  } catch (err: any) {
    res.status(400).json({ error: SarvamOcrService.formatSafeOcrError(err) });
  }
});

// 2. GET /api/ocr/jobs/:id
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    const { id } = req.params;

    const job = await prisma.ocrProcessingJob.findUnique({
      where: { id },
      include: {
        document: {
          select: { id: true, title: true, category: true, reportDate: true, fileSizeBytes: true, mimeType: true },
        },
        reviewedBy: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
      },
    });

    if (!job) {
      res.status(404).json({ error: 'OCR processing job not found' });
      return;
    }

    if (job.patientId !== actor.id && !actor.isClinician) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        documentId: job.documentId,
        patientId: job.patientId,
        provider: job.provider,
        operation: job.operation,
        status: job.status,
        documentType: job.documentType,
        pageCount: job.pageCount,
        creditCostEstimated: job.creditCostEstimated,
        creditCostActual: job.creditCostActual,
        rawOcrText: job.rawOcrText,
        extractedData: job.extractedSchemaJson ? JSON.parse(job.extractedSchemaJson) : null,
        approvalStatus: job.approvalStatus,
        reviewerNotes: job.reviewerNotes,
        reviewedBy: job.reviewedBy?.profile?.fullName || job.reviewedBy?.email || null,
        reviewedAt: job.reviewedAt ? job.reviewedAt.toISOString() : null,
        processingDurationMs: job.processingDurationMs,
        createdAt: job.createdAt.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. POST /api/ocr/jobs/:id/review
router.post('/jobs/:id/review', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor.isClinician) {
      res.status(403).json({ error: 'Only authorized clinicians can review and approve OCR clinical extractions' });
      return;
    }

    const { id } = req.params;
    const input = ReviewOcrJobInputSchema.parse(req.body);

    const updatedJob = await SarvamOcrService.reviewAndCommit(
      id,
      actor.id,
      input.approvalStatus,
      input.reviewerNotes,
      input.fieldCorrections,
      input.commitToTimeline,
    );

    res.json({
      success: true,
      message: `OCR extraction marked as ${input.approvalStatus}${input.commitToTimeline && input.approvalStatus !== 'REJECTED' ? ' and committed to patient health timeline' : ''}.`,
      job: updatedJob,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4. GET /api/ocr/usage-summary
router.get('/usage-summary', async (_req: Request, res: Response) => {
  try {
    const summary = await SarvamOcrService.getUsageSummary();
    res.json({ success: true, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

