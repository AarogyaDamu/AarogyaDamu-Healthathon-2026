import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { resolvePatientContext } from '../permissions/evaluator';
import { savePrivateFile, deletePrivateFile } from '../services/storageService';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document format. Only PDF and images are accepted.'));
    }
  },
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const documents = await prisma.healthDocument.findMany({
      where: { userId: effectivePatientId },
      orderBy: { reportDate: 'desc' },
      select: {
        id: true,
        title: true,
        category: true,
        issuingFacility: true,
        reportDate: true,
        notes: true,
        processingStatus: true,
        fileSizeBytes: true,
        createdAt: true,
      },
    });
    res.json({ documents });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

router.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
      const { title, category, issuingFacility, notes } = req.body;

      if (!title) {
        res.status(400).json({ error: 'Report title is required' });
        return;
      }

      let storagePath: string | undefined = undefined;
      let fileSizeBytes: number | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (req.file) {
        const saved = await savePrivateFile(effectivePatientId, req.file.originalname, req.file.buffer);
        storagePath = saved.storagePath;
        fileSizeBytes = saved.fileSizeBytes;
        mimeType = req.file.mimetype;
      }

      const document = await prisma.healthDocument.create({
        data: {
          userId: effectivePatientId,
          title: title.trim(),
          category: category || 'LAB_REPORT',
          issuingFacility: issuingFacility?.trim() || undefined,
          notes: notes?.trim() || undefined,
          storagePath,
          mimeType,
          fileSizeBytes,
          processingStatus: storagePath ? 'READY' : 'NEEDS_REVIEW',
        },
      });

      await logAuditEvent({
        userId: effectivePatientId,
        actorId: (req as any).user.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'HealthDocument',
        entityId: document.id,
        metadata: { title: document.title, category: document.category },
      });

      res.status(201).json({ document });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.get('/:id/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_DOCUMENTS');
    const { id } = req.params;

    const doc = await prisma.healthDocument.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!doc || !doc.storagePath) {
      res.status(404).json({ error: 'Clinical file not found or unauthorized' });
      return;
    }

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as any).user.id,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'HealthDocument',
      entityId: doc.id,
    });

    res.download(doc.storagePath, `${doc.title}.pdf`);
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
    const { id } = req.params;

    const doc = await prisma.healthDocument.findFirst({
      where: { id, userId: effectivePatientId },
    });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    if (doc.storagePath) {
      await deletePrivateFile(doc.storagePath);
    }

    await prisma.healthDocument.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

export default router;