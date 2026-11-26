import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest, AuthTokenPayload } from '../middleware/auth';
import { resolvePracticeContext } from '../middleware/tenantMiddleware';
import { updateTenantContext, runWithTenantContext, preserveTenantContext } from '../db/tenantContext';
import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';
import { prisma } from '../db/prisma';
import { SarvamOcrService, SarvamOcrUnavailableError } from '../services/sarvamOcrService';
import { readPrivateFile, validateFileMagicBytes, isDurableStorageAvailable } from '../services/storageService';
import { ReviewOcrJobInputSchema } from '@aarogyadamu/contracts';

const router = Router();
router.use(requireAuth);
router.use(resolvePracticeContext);

const temporaryOcrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    callback(null, allowed.includes(file.mimetype));
  },
});

function getActor(req: Request): AuthTokenPayload {
  const user = (req as AuthenticatedRequest).user;
  if (!user) throw new Error('Authentication required');
  return user;
}

// 0. GET /api/ocr/status — truthful configuration & storage capabilities
router.get('/status', (_req: Request, res: Response) => {
  const availability = SarvamOcrService.getAvailability();
  res.json({
    success: true,
    ...availability,
    durableStorageAvailable: isDurableStorageAvailable(),
    temporaryOcrSupported: true,
  });
});

// 0b. POST /api/ocr/extract-temporary — request-scoped in-memory Sarvam OCR (no persistent file saved)
router.post(
  '/extract-temporary',
  preserveTenantContext(temporaryOcrUpload.single('file')),
  async (req: Request, res: Response) => {
    const file = req.file;
    try {
      const actor = getActor(req);
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');

      if (!file) {
        res.status(400).json({ error: 'Upload a valid PDF, JPEG, PNG, or WebP medical report for OCR.' });
        return;
      }

      const magic = validateFileMagicBytes(file.buffer);
      if (!magic.isValid || !magic.detectedMime) {
        res.status(400).json({
          error: 'Invalid file signature. Uploaded file contents do not match PDF, JPEG, PNG, or WebP.',
        });
        return;
      }

      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExt: Record<string, string[]> = {
        'application/pdf': ['.pdf'],
        'image/png': ['.png'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/webp': ['.webp'],
      };
      if (ext && !(allowedExt[magic.detectedMime] || []).includes(ext)) {
        res.status(400).json({
          error: `File extension "${ext}" does not match the detected format (${magic.detectedMime}).`,
        });
        return;
      }

      const result = await SarvamOcrService.processTemporaryBuffer(
        file.buffer,
        magic.detectedMime,
        file.originalname,
      );

      const shouldSaveToPatientRecord =
        req.body?.saveToPatientRecord === 'true' ||
        req.body?.saveToPatientRecord === true ||
        req.query?.saveToPatientRecord === 'true';

      let savedDocument: {
        id: string;
        title: string;
        category: string;
        issuingFacility: string | null;
        reportDate: Date;
        processingStatus: string;
      } | null = null;

      if (shouldSaveToPatientRecord) {
        const stripNullBytes = (value: string) => value.replace(/\u0000/g, '');
        const requestedTitle =
          typeof req.body?.title === 'string' ? stripNullBytes(req.body.title).trim() : '';
        const fallbackTitle = stripNullBytes(path.basename(file.originalname || ''))
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        const documentTitle = (requestedTitle || fallbackTitle || 'Uploaded medical report').slice(0, 160);
        const requestedFacility =
          typeof req.body?.issuingFacility === 'string'
            ? stripNullBytes(req.body.issuingFacility).trim().slice(0, 160)
            : '';
        const issuingFacility =
          requestedFacility || (actor.isClinician ? 'Treating Clinician Upload (Sarvam OCR)' : undefined);
        const category = result.documentType === 'PRESCRIPTION' ? 'PRESCRIPTION' : 'LAB_REPORT';

        const extractedPayload = stripNullBytes(
          JSON.stringify({
            provider: result.provider,
            engine: result.engine,
            status: 'COMPLETED',
            documentType: result.documentType,
            text: result.rawOcrText,
            rawOcrText: result.rawOcrText,
            structuredLabs: result.structuredLabs,
            plainSummary: result.plainSummary,
            doctorAdvice: result.doctorAdvice,
            doctorReviewStatus: 'PENDING',
            doctorNotes: null,
            reviewedBy: null,
            reviewedAt: null,
            persistentFileStored: false,
            uploadedByClinicianId: actor.isClinician ? actor.id : null,
            sarvamJobId: result.sarvamJobId,
            fieldsCount: Object.keys(result.structuredLabs || {}).length,
          }),
        );

        savedDocument = await runWithTenantContext(
          {
            userId: actor.id,
            patientId: effectivePatientId,
            role: actor.isClinician ? 'DOCTOR' : 'PATIENT',
          },
          async () => {
            return prisma.healthDocument.create({
              data: {
                userId: effectivePatientId,
                title: documentTitle,
                category,
                issuingFacility,
                processingStatus: 'COMPLETED',
                notes:
                  'Extracted via Sarvam Document AI and stored in the patient record. Original binary file scrubbed from memory (durable file storage unavailable).',
                extractedData: extractedPayload,
              },
              select: {
                id: true,
                title: true,
                category: true,
                issuingFacility: true,
                reportDate: true,
                processingStatus: true,
              },
            });
          },
        );
      }

      await logAuditEvent({
        userId: effectivePatientId,
        actorId: actor.id,
        action: 'DOCUMENT_TEMPORARY_OCR_EXTRACTED',
        entityType: savedDocument ? 'HealthDocument' : 'OcrTemporaryExtract',
        entityId: savedDocument?.id,
        metadata: {
          mode: result.mode,
          engine: result.engine,
          documentType: result.documentType,
          persistentStorage: false,
          persistentFileStored: false,
          savedToPatientRecord: Boolean(savedDocument),
          temporaryCleanedUp: result.temporaryCleanedUp,
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({
        ...result,
        savedToPatientRecord: Boolean(savedDocument),
        document: savedDocument
          ? {
              ...savedDocument,
              hasOriginalFile: false,
              persistentFileStored: false,
            }
          : null,
      });
    } catch (err: any) {
      if (err instanceof AuthorizationError || err?.status === 403 || err?.message?.includes('Forbidden')) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof SarvamOcrUnavailableError) {
        res.status(503).json({
          success: false,
          code: err.code,
          error: SarvamOcrService.formatSafeOcrError(err),
          persistentStorage: false,
          temporaryCleanedUp: true,
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: SarvamOcrService.formatSafeOcrError(err),
        persistentStorage: false,
        temporaryCleanedUp: true,
      });
    } finally {
      if (file?.buffer && Buffer.isBuffer(file.buffer)) {
        file.buffer.fill(0);
      }
    }
  },
);

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

    if (!doc.storagePath || !storedFile) {
      res.status(404).json({
        error: 'Original document file is unavailable. Persistent storage is not enabled or file was not saved.',
      });
      return;
    }

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
    if (err instanceof SarvamOcrUnavailableError) {
      res.status(503).json({
        code: err.code,
        error: SarvamOcrService.formatSafeOcrError(err),
      });
      return;
    }
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

