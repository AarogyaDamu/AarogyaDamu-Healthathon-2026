import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { resolvePatientContext } from '../permissions/evaluator';
import { preserveTenantContext } from '../db/tenantContext';
import { savePrivateFile, readPrivateFile, deletePrivateFile, validateFileMagicBytes } from '../services/storageService';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
import { prisma } from '../db/prisma';

const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // file count limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document format. Only PDF, PNG, JPEG, and WebP are accepted.'));
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
        mimeType: true,
        extractedData: true,
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
  preserveTenantContext(upload.single('file')),
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
        // Enforce magic bytes inspection to prevent extension/mimetype spoofing
        const magicResult = validateFileMagicBytes(req.file.buffer);
        if (!magicResult.isValid) {
          res.status(400).json({
            error: 'Invalid file signature. Uploaded file contents do not match allowed formats (PDF, JPEG, PNG, WebP).',
          });
          return;
        }

        const allowedExtensions: Record<string, string[]> = {
          'application/pdf': ['.pdf'],
          'image/png': ['.png'],
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/webp': ['.webp'],
        };

        const ext = path.extname(req.file.originalname).toLowerCase();
        const detectedMime = magicResult.detectedMime!;
        const validExts = allowedExtensions[detectedMime] || [];
        if (ext && !validExts.includes(ext)) {
          res.status(400).json({
            error: `File extension "${ext}" does not match the detected file format (${detectedMime}).`,
          });
          return;
        }

        const saved = await savePrivateFile(effectivePatientId, req.file.originalname, req.file.buffer, detectedMime);
        storagePath = saved.storagePath;
        fileSizeBytes = saved.fileSizeBytes;
        mimeType = detectedMime;
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

router.get('/:id/preview', requireAuth, async (req: Request, res: Response): Promise<void> => {
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

    const stored = await readPrivateFile(doc.storagePath);
    if (!stored) {
      res.status(404).json({ error: 'Clinical document file not found on storage volume' });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as any).user.id,
      action: 'DOCUMENT_PREVIEWED',
      entityType: 'HealthDocument',
      entityId: doc.id,
    });

    res.send(stored.buffer);
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

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

    const stored = await readPrivateFile(doc.storagePath);
    if (!stored) {
      res.status(404).json({ error: 'Clinical document file not found on storage volume' });
      return;
    }

    res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as any).user.id,
      action: 'DOCUMENT_DOWNLOADED',
      entityType: 'HealthDocument',
      entityId: doc.id,
    });

    const safeTitle = (doc.title || 'medical_report').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeExt = stored.ext || '.pdf';
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}${safeExt}"`);
    res.send(stored.buffer);
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
