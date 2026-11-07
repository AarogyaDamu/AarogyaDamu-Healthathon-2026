import { createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AuthorizationError, resolvePatientContext } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const EXCHANGE_KEY_PREFIX = 'synthetic-abha-v1';

function syntheticAbhaId(patientId: string): string {
  const digits = createHash('sha256')
    .update(`aarogyadamu-synthetic-abha:${patientId}`)
    .digest('hex')
    .replace(/[a-f]/g, (char) => String(parseInt(char, 16) % 10));
  return `12-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

function actorId(req: Request): string {
  const id = (req as AuthenticatedRequest).user?.id;
  if (!id) throw new AuthorizationError('Authentication required');
  return id;
}

async function buildHealthSummary(patientId: string) {
  const [profile, observations, medications, tasks, documents] = await Promise.all([
    prisma.patientProfile.findUnique({ where: { userId: patientId }, select: { fullName: true, diabetesType: true, knownAllergies: true } }),
    prisma.healthObservation.findMany({ where: { userId: patientId }, orderBy: { observedAt: 'desc' }, take: 12, select: { type: true, numericValue: true, unit: true, context: true, clinicalFlag: true, observedAt: true, provenance: true } }),
    prisma.medicationSchedule.findMany({ where: { userId: patientId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 12, select: { medicineName: true, medicationName: true, dosage: true, timing: true, frequency: true, status: true, reviewStatus: true } }),
    prisma.careTask.findMany({ where: { userId: patientId }, orderBy: { dueAt: 'asc' }, take: 12, select: { title: true, category: true, status: true, dueAt: true, priority: true } }),
    prisma.healthDocument.findMany({ where: { userId: patientId }, orderBy: { reportDate: 'desc' }, take: 12, select: { title: true, category: true, reportDate: true, processingStatus: true, mimeType: true } }),
  ]);

  return {
    isSynthetic: true,
    disclaimer: 'Synthetic ABHA sandbox summary for product demonstration only. Not connected to ABDM and not clinical advice.',
    patient: profile,
    observations,
    medications,
    tasks,
    documents,
    counts: {
      observations: observations.length,
      activeMedications: medications.length,
      tasks: tasks.length,
      documents: documents.length,
    },
  };
}

router.get('/export', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_HEALTH_SUMMARY');
    const id = actorId(req);
    const summary = await buildHealthSummary(effectivePatientId);
    const abhaId = syntheticAbhaId(effectivePatientId);
    await logAuditEvent({
      userId: effectivePatientId,
      actorId: id,
      action: 'SYNTHETIC_ABHA_EXPORTED',
      entityType: 'SyntheticABHA',
      metadata: { abhaId, exchangeKey: `${EXCHANGE_KEY_PREFIX}:export:${Date.now()}`, counts: summary.counts },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({
      exported: true,
      mode: 'SYNTHETIC_ABHA_SANDBOX',
      abhaId,
      exportedAt: new Date().toISOString(),
      summary,
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err.message });
  }
});

router.post('/import', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_DOCUMENTS');
    const id = actorId(req);
    const abhaId = syntheticAbhaId(effectivePatientId);
    const exchangeKey = `${EXCHANGE_KEY_PREFIX}:import:${effectivePatientId}`;
    const priorImport = await prisma.auditLog.findFirst({
      where: {
        userId: effectivePatientId,
        action: 'SYNTHETIC_ABHA_IMPORTED',
        entityType: 'SyntheticABHA',
        metadata: { contains: exchangeKey },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true, createdAt: true },
    });

    if (priorImport) {
      const summary = await buildHealthSummary(effectivePatientId);
      res.json({
        imported: true,
        alreadyImported: true,
        mode: 'SYNTHETIC_ABHA_SANDBOX',
        abhaId,
        importedAt: priorImport.createdAt.toISOString(),
        summary,
      });
      return;
    }

    const now = new Date();
    const observationRows = [
      { userId: effectivePatientId, type: 'BLOOD_GLUCOSE', numericValue: 112, unit: 'mg/dL', context: 'FASTING', clinicalFlag: 'NORMAL', provenance: 'SYNTHETIC_ABHA_IMPORT', sourceProvenance: 'SYNTHETIC_ABHA_SANDBOX', notes: 'Synthetic ABHA sandbox import', idempotencyKey: `${exchangeKey}:observation:fasting`, observedAt: now },
      { userId: effectivePatientId, type: 'HBA1C', numericValue: 6.8, unit: '%', context: 'LAB', clinicalFlag: 'NORMAL', provenance: 'SYNTHETIC_ABHA_IMPORT', sourceProvenance: 'SYNTHETIC_ABHA_SANDBOX', notes: 'Synthetic ABHA sandbox import', idempotencyKey: `${exchangeKey}:observation:hba1c`, observedAt: now },
    ];
    const taskKey = `${exchangeKey}:task:review`;
    const documentText = [
      'SYNTHETIC ABHA SANDBOX IMPORT',
      'Patient health summary imported locally for demonstration.',
      'Recent reading: fasting glucose 112 mg/dL.',
      'Recent lab: HbA1c 6.8%.',
      'This record is synthetic and is not connected to ABDM.',
    ].join('\n');

    await prisma.$transaction(async (tx) => {
      await tx.healthObservation.createMany({ data: observationRows, skipDuplicates: true });
      const existingMedication = await tx.medicationSchedule.findFirst({
        where: { userId: effectivePatientId, source: 'SYNTHETIC_ABHA_IMPORT', notes: { contains: exchangeKey } },
        select: { id: true },
      });
      if (!existingMedication) {
        await tx.medicationSchedule.create({
          data: {
            userId: effectivePatientId,
            medicineName: 'Metformin (synthetic example)',
            medicationName: 'Metformin (synthetic example)',
            dosage: '500 mg',
            dosageInstruction: 'Take with the evening meal — demo data only',
            timing: 'EVENING',
            frequency: 'ONCE_DAILY',
            prescriber: 'Synthetic ABHA sandbox',
            source: 'SYNTHETIC_ABHA_IMPORT',
            reviewStatus: 'UNREVIEWED',
            notes: exchangeKey,
          },
        });
      }
      await tx.careTask.createMany({
        data: [{
          userId: effectivePatientId,
          title: 'Review imported synthetic health summary',
          category: 'FOLLOW_UP',
          instructions: 'Confirm imported values against the original source before clinical use.',
          clinicalNotes: 'Synthetic ABHA sandbox task; not a clinical instruction.',
          priority: 'MEDIUM',
          frequency: 'ONCE',
          status: 'PENDING',
          dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          idempotencyKey: taskKey,
        }],
        skipDuplicates: true,
      });
      const existingDocument = await tx.healthDocument.findFirst({
        where: { userId: effectivePatientId, notes: { contains: exchangeKey } },
        select: { id: true },
      });
      if (!existingDocument) {
        await tx.healthDocument.create({
          data: {
            userId: effectivePatientId,
            title: 'Synthetic ABHA Health Summary',
            category: 'ABHA_IMPORT',
            issuingFacility: 'Synthetic ABHA sandbox',
            processingStatus: 'IMPORTED',
            notes: exchangeKey,
            mimeType: 'application/json',
            extractedData: JSON.stringify({ provider: 'SYNTHETIC_ABHA_SANDBOX', status: 'IMPORTED', text: documentText, isSynthetic: true }),
          },
        });
      }
    });

    const summary = await buildHealthSummary(effectivePatientId);
    await logAuditEvent({
      userId: effectivePatientId,
      actorId: id,
      action: 'SYNTHETIC_ABHA_IMPORTED',
      entityType: 'SyntheticABHA',
      metadata: { abhaId, exchangeKey, counts: summary.counts },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({
      imported: true,
      alreadyImported: false,
      mode: 'SYNTHETIC_ABHA_SANDBOX',
      abhaId,
      importedAt: new Date().toISOString(),
      summary,
    });
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err.message });
  }
});

export default router;
