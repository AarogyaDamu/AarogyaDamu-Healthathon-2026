
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import {
  requireAuth,
  AuthenticatedRequest,
} from '../middleware/auth';
import { requireClinician } from '../middleware/requireClinician';
import {
  AuthorizationError,
  resolvePatientContext,
} from '../permissions/evaluator';
import {
  GeminiScribeService,
  ScribeServiceError,
  speakerSegmentSchema,
  structuredClinicalNoteSchema,
} from '../services/scribeService';

const router = Router();
const prisma = new PrismaClient();

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 15 * 60;

const SUPPORTED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
] as const;

const sessionSchema = z.object({
  patientId: z.string().uuid(),
  consultationId: z.string().uuid(),
  consentObtained: z.literal(true),
  consentVersion: z.string().min(1).max(64),
  idempotencyKey: z.string().min(16).max(128),
}).strict();

const processingSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.enum(SUPPORTED_AUDIO_TYPES),
  durationSeconds: z.number().int().min(1).max(MAX_RECORDING_SECONDS),
}).strict();

const approvalSchema = z.object({
  editedStructuredNote: structuredClinicalNoteSchema.optional(),
  editedSegments: z.array(speakerSegmentSchema).min(1).max(5_000).optional(),
  approvedSummaryText: z.string().max(20_000).optional(),
}).strict();

const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
}).strict();

function actorId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).user?.id;
}

function sendRouteError(res: Response, error: unknown): void {
  if (error instanceof AuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }

  if (error instanceof ScribeServiceError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({
      error: 'Request validation failed.',
      details: error.issues,
    });
    return;
  }

  console.error('[Secure Scribe]', error);

  res.status(500).json({
    error: 'The clinical scribe request could not be completed.',
  });
}

/**
 * Enforces an explicit patient-target header and active patient authorization.
 *
 * Doctor access is not inferred from knowing a patient's ID.
 * The authenticated clinician must have an active consent grant.
 */
async function authorizePatient(
  req: Request,
  patientId: string,
  permission: 'MANAGE_CONSULTATIONS' | 'VIEW_CONSULTATIONS',
): Promise<void> {
  if (req.headers['x-target-patient-id'] !== patientId) {
    throw new AuthorizationError(
      'The selected patient does not match the authorized patient context.',
    );
  }

  const context = await resolvePatientContext(req, permission);

  if (
    context.effectivePatientId !== patientId ||
    !context.isDelegated
  ) {
    throw new AuthorizationError(
      'Clinician access requires an active patient authorization grant.',
    );
  }
}

function sessionResponse(note: {
  id: string;
  status: string;
  recordingStatus: string;
  rawTranscript: string;
  speakerSegments: string;
  structuredNote: string;
  retryCount: number;
}) {
  return {
    id: note.id,
    status: note.status,
    recordingStatus: note.recordingStatus,
    retryCount: note.retryCount,
    transcript: note.rawTranscript || undefined,
    segments:
      note.speakerSegments === '[]'
        ? []
        : JSON.parse(note.speakerSegments),
    structuredNote:
      note.structuredNote === '{}'
        ? undefined
        : JSON.parse(note.structuredNote),
  };
}

/**
 * Every route below requires authentication and clinician authorization.
 */
router.use(requireAuth, requireClinician);

/**
 * GET /api/scribe/patients
 *
 * Lists patients who have an active consent grant that permits consultation
 * management by the authenticated clinician.
 */
router.get(
  '/patients',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = actorId(req);

      if (!userId) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const clinician = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!clinician) {
        res.status(401).json({
          error: 'Clinician account no longer exists.',
        });
        return;
      }

      const consents = await prisma.caregiverConsent.findMany({
        where: {
          caregiverEmail: clinician.email,
          status: 'ACTIVE',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
        include: {
          patient: {
            select: {
              id: true,
              profile: {
                select: {
                  fullName: true,
                  diabetesType: true,
                },
              },
              consultationPreps: {
                orderBy: { scheduledAt: 'desc' },
                take: 20,
                select: {
                  id: true,
                  scheduledAt: true,
                  clinicianName: true,
                  facilityName: true,
                },
              },
            },
          },
        },
      });

      const patients = consents.flatMap((consent) => {
        let parsedPermissions: string[];

        try {
          const parsed = JSON.parse(consent.permissions);
          const validation = z.array(z.string()).safeParse(parsed);

          if (!validation.success) {
            return [];
          }

          parsedPermissions = validation.data;
        } catch {
          return [];
        }

        if (
          !parsedPermissions.includes('MANAGE_CONSULTATIONS')
        ) {
          return [];
        }

        return [
          {
            id: consent.patient.id,
            fullName:
              consent.patient.profile?.fullName ?? 'Patient',
            diabetesType:
              consent.patient.profile?.diabetesType ?? 'UNKNOWN',
            consultations: consent.patient.consultationPreps,
          },
        ];
      });

      res.json({ patients });
    } catch (error) {
      sendRouteError(res, error);
    }
  },
);

/**
 * POST /api/scribe/sessions
 *
 * Creates a consent-recorded session for an existing patient consultation.
 * Audio processing cannot start before a valid consent event is recorded.
 */
router.post(
  '/sessions',
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Return a clear consent error before validating the rest of the body.
      if (req.body?.consentObtained !== true) {
        res.status(400).json({
          error:
            'Informed consent is required before creating a scribe session.',
        });
        return;
      }

      const input = sessionSchema.parse(req.body);
      const clinicianId = actorId(req);

      if (!clinicianId) {
        res.status(401).json({
          error: 'Authentication required.',
        });
        return;
      }

      await authorizePatient(
        req,
        input.patientId,
        'MANAGE_CONSULTATIONS',
      );

      const consultation = await prisma.consultationPrep.findFirst({
        where: {
          id: input.consultationId,
          userId: input.patientId,
        },
        select: { id: true },
      });

      if (!consultation) {
        res.status(404).json({
          error: 'Authorized consultation not found.',
        });
        return;
      }

      const previous = await prisma.consultationNote.findFirst({
        where: {
          clinicianId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (previous) {
        if (
          previous.userId !== input.patientId ||
          previous.consultationPrepId !== input.consultationId
        ) {
          res.status(409).json({
            error:
              'Idempotency key was already used for a different consultation.',
          });
          return;
        }

        res.status(200).json({
          session: sessionResponse(previous),
        });
        return;
      }

      const clinician = await prisma.user.findUnique({
        where: { id: clinicianId },
        include: {
          profile: {
            select: {
              fullName: true,
              primaryClinician: true,
            },
          },
        },
      });

      if (!clinician) {
        res.status(401).json({
          error: 'Clinician account no longer exists.',
        });
        return;
      }

      const sessionId = crypto.randomUUID();
      const consentAt = new Date();

      const created = await prisma.$transaction(
        async (transaction) => {
          const note = await transaction.consultationNote.create({
            data: {
              id: sessionId,
              userId: input.patientId,
              clinicianId,
              consultationPrepId: input.consultationId,
              idempotencyKey: input.idempotencyKey,
              clinicianName:
                clinician.profile?.fullName ??
                'Treating clinician',
              facilityName:
                clinician.profile?.primaryClinician ??
                undefined,
              status: 'RECORDING',
              recordingStatus: 'RECORDING',
              audioConsentObtained: true,
              audioConsentAt: consentAt,
              consentMetadata: JSON.stringify({
                consentVersion: input.consentVersion,
              }),
              rawTranscript: '',
              speakerSegments: '[]',
              structuredNote: '{}',
            },
          });

          await transaction.auditLog.create({
            data: {
              userId: input.patientId,
              actorId: clinicianId,
              action: 'SCRIBE_CONSENT_RECORDED',
              entityType: 'ConsultationNote',
              entityId: note.id,
              metadata: JSON.stringify({
                consentVersion: input.consentVersion,
              }),
            },
          });

          return note;
        },
      );

      res.status(201).json({
        session: sessionResponse(created),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        res.status(409).json({
          error:
            'This recording session was already created. Reuse its session identifier.',
        });
        return;
      }

      sendRouteError(res, error);
    }
  },
);

/**
 * POST /api/scribe/sessions/:id/process
 *
 * Validates the recording, enforces the recorded consent event, invokes the
 * transcription and clinical-note services, and saves the note for review.
 */
router.post(
  '/sessions/:id/process',
  async (req: Request, res: Response): Promise<void> => {
    let sessionId: string | undefined;
    let clinicianId: string | undefined;
    let patientId: string | undefined;

    try {
      const input = processingSchema.parse(req.body);

      sessionId = req.params.id;
      clinicianId = actorId(req);

      const note = await prisma.consultationNote.findUnique({
        where: { id: sessionId },
      });

      if (!note) {
        res.status(404).json({
          error: 'Recording session not found.',
        });
        return;
      }

      patientId = note.userId;

      if (
        !clinicianId ||
        note.clinicianId !== clinicianId
      ) {
        res.status(403).json({
          error:
            'Only the clinician who started this session may process it.',
        });
        return;
      }

      await authorizePatient(
        req,
        note.userId,
        'MANAGE_CONSULTATIONS',
      );

      if (
        !note.audioConsentObtained ||
        !note.audioConsentAt
      ) {
        res.status(400).json({
          error:
            'A recorded consent event is required before audio processing.',
        });
        return;
      }

      const normalizedAudio = input.audioBase64.replace(
        /^data:[^,]+,/,
        '',
      );

      if (
        !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedAudio) ||
        normalizedAudio.length % 4 !== 0
      ) {
        res.status(400).json({
          error: 'Audio payload is not valid base64.',
        });
        return;
      }

      const audio = Buffer.from(normalizedAudio, 'base64');

      if (
        !audio.length ||
        audio.length > MAX_AUDIO_BYTES
      ) {
        res.status(413).json({
          error: 'Audio must be between 1 byte and 10 MB.',
        });
        return;
      }

      if (note.retryCount >= 3) {
        res.status(429).json({
          error:
            'This session has reached the maximum of three processing attempts.',
        });
        return;
      }

      if (!['RECORDING', 'FAILED'].includes(note.status)) {
        res.status(409).json({
          error:
            `This session cannot be processed while in ${note.status} state.`,
        });
        return;
      }

      const claim = await prisma.consultationNote.updateMany({
        where: {
          id: note.id,
          status: note.status,
        },
        data: {
          status: 'PROCESSING',
          recordingStatus: 'UPLOADING',
          recordingDurationSeconds: input.durationSeconds,
          retryCount: { increment: 1 },
        },
      });

      if (claim.count !== 1) {
        res.status(409).json({
          error: 'This session is already being processed.',
        });
        return;
      }

      const baseline = await prisma.patientProfile.findUnique({
        where: { userId: patientId },
        select: {
          fullName: true,
          diabetesType: true,
          knownAllergies: true,
        },
      });

      await prisma.consultationNote.update({
        where: { id: note.id },
        data: { recordingStatus: 'TRANSCRIBING' },
      });

      const result =
        await GeminiScribeService.transcribeAndDiarize(
          normalizedAudio,
          input.mimeType,
        );

      await prisma.consultationNote.update({
        where: { id: note.id },
        data: { recordingStatus: 'GENERATING_NOTE' },
      });

      const structuredNote =
        await GeminiScribeService.generateClinicalNote(
          result.transcript,
          result.segments,
          {
            fullName: baseline?.fullName,
            diabetesType: baseline?.diabetesType,
            allergies: baseline?.knownAllergies,
          },
        );

      const provider =
        GeminiScribeService.getConfiguredProviderName();

      const completed =
        await prisma.consultationNote.update({
          where: { id: note.id },
          data: {
            status: 'PENDING_REVIEW',
            recordingStatus: 'COMPLETED',
            transcriptionProvider: provider,
            rawTranscript: result.transcript,
            speakerSegments: JSON.stringify(result.segments),
            structuredNote: JSON.stringify(structuredNote),
          },
        });

      await prisma.auditLog.create({
        data: {
          userId: patientId,
          actorId: clinicianId,
          action: 'SCRIBE_NOTE_DRAFTED',
          entityType: 'ConsultationNote',
          entityId: completed.id,
        },
      });

      res.status(200).json({
        session: sessionResponse(completed),
      });
    } catch (error) {
      if (sessionId && clinicianId && patientId) {
        try {
          await prisma.consultationNote.updateMany({
            where: {
              id: sessionId,
              clinicianId,
              status: 'PROCESSING',
            },
            data: {
              status: 'FAILED',
              recordingStatus: 'FAILED',
            },
          });
        } catch (updateError) {
          console.error(
            '[Secure Scribe] Failed to mark processing session as failed.',
            updateError,
          );
        }
      }

      sendRouteError(res, error);
    }
  },
);

/**
 * POST /api/scribe/sessions/:id/cancel
 *
 * Cancels a session only when it is still in the recording state.
 */
router.post(
  '/sessions/:id/cancel',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clinicianId = actorId(req);

      const note = await prisma.consultationNote.findUnique({
        where: { id: req.params.id },
      });

      if (
        !note ||
        !clinicianId ||
        note.clinicianId !== clinicianId
      ) {
        res.status(404).json({
          error: 'Recording session not found.',
        });
        return;
      }

      await authorizePatient(
        req,
        note.userId,
        'MANAGE_CONSULTATIONS',
      );

      const cancelled = await prisma.consultationNote.updateMany({
        where: {
          id: note.id,
          status: 'RECORDING',
        },
        data: {
          status: 'CANCELLED',
          recordingStatus: 'CANCELLED',
        },
      });

      if (!cancelled.count) {
        res.status(409).json({
          error:
            'Only an active recording session can be cancelled.',
        });
        return;
      }

      res.json({
        id: note.id,
        status: 'CANCELLED',
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  },
);

/**
 * POST /api/scribe/:id/approve
 *
 * A note becomes available on the patient timeline only after approval.
 */
router.post(
  '/:id/approve',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const input = approvalSchema.parse(req.body);
      const clinicianId = actorId(req);

      const existing =
        await prisma.consultationNote.findUnique({
          where: { id: req.params.id },
        });

      if (!existing) {
        res.status(404).json({
          error: 'Consultation draft not found.',
        });
        return;
      }

      if (
        !clinicianId ||
        existing.clinicianId !== clinicianId
      ) {
        res.status(403).json({
          error:
            'Only the clinician who created this draft may approve it.',
        });
        return;
      }

      await authorizePatient(
        req,
        existing.userId,
        'MANAGE_CONSULTATIONS',
      );

      if (existing.status !== 'PENDING_REVIEW') {
        res.status(409).json({
          error:
            'Only a pending-review note can be approved.',
        });
        return;
      }

      const note =
        input.editedStructuredNote ??
        structuredClinicalNoteSchema.parse(
          JSON.parse(existing.structuredNote),
        );

      const segments =
        input.editedSegments ??
        z.array(speakerSegmentSchema).parse(
          JSON.parse(existing.speakerSegments),
        );

      const summary =
        input.approvedSummaryText?.trim() ||
        GeminiScribeService.formatApprovedClinicalSummary(
          note,
          existing.clinicianName,
        );

      const approved = await prisma.$transaction(
        async (transaction) => {
          const update =
            await transaction.consultationNote.updateMany({
              where: {
                id: existing.id,
                status: 'PENDING_REVIEW',
              },
              data: {
                status: 'APPROVED',
                structuredNote: JSON.stringify(note),
                speakerSegments: JSON.stringify(segments),
                approvedNoteText: summary,
                approvedAt: new Date(),
                approvedBy: clinicianId,
              },
            });

          if (update.count !== 1) {
            throw new Error(
              'This note has already been reviewed.',
            );
          }

          await transaction.auditLog.create({
            data: {
              userId: existing.userId,
              actorId: clinicianId,
              action: 'CONSULTATION_SCRIBE_APPROVED',
              entityType: 'ConsultationNote',
              entityId: existing.id,
            },
          });

          return transaction.consultationNote.findUniqueOrThrow({
            where: { id: existing.id },
          });
        },
      );

      res.json({
        approvedNote: {
          ...approved,
          speakerSegments: segments,
          structuredNote: note,
        },
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  },
);

/**
 * POST /api/scribe/:id/reject
 *
 * Rejected notes remain excluded from the approved patient timeline.
 */
router.post(
  '/:id/reject',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const input = rejectSchema.parse(req.body);
      const clinicianId = actorId(req);

      const note = await prisma.consultationNote.findUnique({
        where: { id: req.params.id },
      });

      if (!note) {
        res.status(404).json({
          error: 'Consultation draft not found.',
        });
        return;
      }

      if (
        !clinicianId ||
        note.clinicianId !== clinicianId
      ) {
        res.status(403).json({
          error:
            'Only the clinician who created this draft may reject it.',
        });
        return;
      }

      await authorizePatient(
        req,
        note.userId,
        'MANAGE_CONSULTATIONS',
      );

      const update = await prisma.consultationNote.updateMany({
        where: {
          id: note.id,
          status: 'PENDING_REVIEW',
        },
        data: {
          status: 'REJECTED',
          rejectionReason: input.reason,
        },
      });

      if (!update.count) {
        res.status(409).json({
          error:
            'Only a pending-review note can be rejected.',
        });
        return;
      }

      await prisma.auditLog.create({
        data: {
          userId: note.userId,
          actorId: clinicianId,
          action: 'SCRIBE_NOTE_REJECTED',
          entityType: 'ConsultationNote',
          entityId: note.id,
        },
      });

      res.json({
        id: note.id,
        status: 'REJECTED',
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  },
);

/**
 * GET /api/scribe/patient/:patientId
 *
 * Returns only approved notes for the authorized patient.
 */
router.get(
  '/patient/:patientId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { patientId } = req.params;

      await authorizePatient(
        req,
        patientId,
        'VIEW_CONSULTATIONS',
      );

      const notes = await prisma.consultationNote.findMany({
        where: {
          userId: patientId,
          status: 'APPROVED',
        },
        orderBy: { approvedAt: 'desc' },
      });

      res.json({
        notes: notes.map((note) => ({
          ...note,
          speakerSegments: JSON.parse(note.speakerSegments),
          structuredNote: JSON.parse(note.structuredNote),
        })),
      });
    } catch (error) {
      sendRouteError(res, error);
    }
  },
);

router.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Scribe endpoint not found.',
  });
});

export default router;
