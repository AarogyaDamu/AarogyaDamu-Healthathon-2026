import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { DamuInteractRequestSchema } from '@aarogyadamu/contracts';

import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { createRateLimitStore } from '../services/rateLimitStore';
import {
  getDamuProvider,
  DamuServiceError,
  redactApiKey,
} from '../services/damuVoiceService';
import { env } from '../config/env';
import { processDamuInteraction } from '../services/damuIntelligenceService';

const router = Router();
import { prisma } from '../db/prisma';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB max audio payload

// Rate limiter: 60 requests per 15 minutes per user
const damuRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('damu_voice_limit:', 15 * 60 * 1000),
  keyGenerator: (req) => {
    return (req as AuthenticatedRequest).user?.id || req.ip || 'anonymous';
  },
  message: {
    error: 'Too many voice interaction requests. Please wait a few minutes before trying again.',
  },
});

/**
 * GET /api/damu/status
 * Returns current assistant readiness, active provider models, supported regional languages,
 * and zero-retention privacy policy.
 */
router.get(
  '/status',
  requireFeature('P0_6_GROQ_VOICE_ASSISTANT'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const provider = getDamuProvider();
      const status = await provider.getProviderStatus();
      res.json(status);
    } catch (error) {
      safeClinicalLog('error', 'Failed to retrieve Damu provider status', { error: String(error) });
      if (error instanceof DamuServiceError) {
        res.status(error.status).json({
          error: 'Damu voice provider is unavailable.',
          code: 'DAMU_PROVIDER_UNAVAILABLE',
        });
        return;
      }
      res.status(500).json({ error: 'Failed to retrieve voice assistant status.' });
    }
  }
);

/**
 * POST /api/damu/interact
 * Main conversational & voice health intelligence interaction endpoint (Phase 6).
 */
router.post(
  '/interact',
  requireAuth,
  requireFeature('P0_6_GROQ_VOICE_ASSISTANT'),
  damuRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    let audioBuffer: Buffer | null = null;
    try {
      // 1. Validate request payload against contract schema
      const parseResult = DamuInteractRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation failed for Damu interaction request.',
          details: parseResult.error.issues,
        });
        return;
      }

      const input = parseResult.data;

      // 2. Resolve patient context & authorize access
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { effectivePatientId, isDelegated } = await resolvePatientContext(
        req,
        'VIEW_OBSERVATIONS'
      );

      // Check caregiver specific permission filters if delegated
      let filterPermissions:
        | {
            canViewHealthSummary?: boolean;
            canViewMedications?: boolean;
            canViewTasks?: boolean;
            canViewConsultations?: boolean;
          }
        | undefined = undefined;
      if (isDelegated) {
        const consent = await prisma.caregiverConsent.findFirst({
          where: {
            patientId: effectivePatientId,
            caregiverEmail: authUser.email,
            status: 'ACTIVE',
          },
        });
        if (consent) {
          try {
            const granted: string[] = JSON.parse(consent.permissions);
            filterPermissions = {
              canViewHealthSummary:
                granted.includes('VIEW_HEALTH_SUMMARY') || granted.includes('VIEW_OBSERVATIONS'),
              canViewMedications: granted.includes('VIEW_MEDICATIONS'),
              canViewTasks: granted.includes('VIEW_TASKS'),
              canViewConsultations: granted.includes('VIEW_CONSULTATIONS'),
            };
          } catch {
            // A malformed consent record must never broaden access. Fail closed.
            res.status(403).json({
              error: 'Damu access is unavailable because the caregiver consent record could not be verified.',
              code: 'CONSENT_RECORD_INVALID',
            });
            return;
          }
        }
      }

      // 3. Audio & Text Prompt Preconditions
      if (!input.audioBase64 && (!input.textPrompt || !input.textPrompt.trim())) {
        res.status(400).json({
          error: 'Either audioBase64 or a non-empty textPrompt must be provided.',
        });
        return;
      }

      let transcribedText: string | undefined = undefined;
      let detectedLang = input.language || 'en-IN';
      let provider: ReturnType<typeof getDamuProvider> | undefined;

      try {
        provider = getDamuProvider();
      } catch {
        // If provider cannot be initialized, text interactions will continue without STT/TTS
      }

      // 4. Handle Audio Transcription with Strict Zero Retention
      if (input.audioBase64) {
        if (!provider) {
          throw new DamuServiceError('Damu voice provider is not configured for audio transcription.', 503);
        }
        try {
          audioBuffer = Buffer.from(input.audioBase64, 'base64');
        } catch {
          res.status(400).json({ error: 'Invalid base64 encoding for audio payload.' });
          return;
        }

        if (audioBuffer.length === 0) {
          res.status(400).json({ error: 'Audio payload cannot be empty.' });
          return;
        }

        if (audioBuffer.length > MAX_AUDIO_BYTES) {
          audioBuffer = null;
          res.status(413).json({ error: 'Audio payload exceeds maximum size limit of 10MB.' });
          return;
        }

        const transcriptionResult = await provider.transcribeAudio(
          audioBuffer,
          input.mimeType || 'audio/mp4',
          input.language
        );

        transcribedText = transcriptionResult.transcript;
        detectedLang = transcriptionResult.detectedLanguage;

        // Immediate memory purge of raw audio buffer (Zero Retention guarantee)
        audioBuffer = null;
      }

      const finalQuery = (input.textPrompt || transcribedText || '').trim();
      if (!finalQuery) {
        res.status(400).json({ error: 'No query or transcription could be extracted.' });
        return;
      }

      // 5. Execute Damu Health Intelligence Pipeline
      const intelligenceResult = await processDamuInteraction({
        patientId: effectivePatientId,
        userQuery: finalQuery,
        language: detectedLang,
        conversationId: input.conversationId,
        reportId: input.reportId,
        actorId: authUser.id,
        actorRole: isDelegated ? 'CAREGIVER' : authUser.isClinician ? 'CLINICIAN' : 'PATIENT',
        isCaregiver: isDelegated,
        filterPermissions,
      });

      // 6. Synthesize Spoken Response via Sarvam Bulbul TTS
      let ttsAudio: { audioBase64: string; format: string; provider: string; speaker: string } | undefined;
      let ttsError: string | undefined;

      const textToSynthesize = (intelligenceResult.spokenText || intelligenceResult.textResponse || '').trim();
      if (textToSynthesize && provider) {
        try {
          ttsAudio = await provider.synthesizeSpeech({
            text: textToSynthesize,
            language: detectedLang,
          });
        } catch (err: any) {
          safeClinicalLog('warn', 'Sarvam Bulbul TTS speech synthesis failed', { error: String(err) });
          ttsError = redactApiKey(err?.message || 'Voice synthesis unavailable', env.SARVAM_API_KEY);
        }
      }

      const isMock = input.audioBase64
        ? provider?.name === 'mock-damu-provider'
        : false;

      // 7. Audit Logging (Zero-Retention: Audio and raw audio tokens are never logged)
      await logAuditEvent({
        userId: effectivePatientId,
        actorId: authUser.id,
        action: 'DAMU_VOICE_INTERACTION',
        entityType: 'VOICE_SESSION',
        metadata: {
          intent: intelligenceResult.intent,
          language: detectedLang,
          isMock,
          hasEmergencyNotice: Boolean(intelligenceResult.emergencyNotice),
          consentVersion: input.consentVersion,
          audioPurged: true,
          audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
          conversationId: intelligenceResult.conversationId,
          ttsProvider: ttsAudio?.provider || null,
          ttsSpeaker: ttsAudio?.speaker || null,
          ttsGenerated: Boolean(ttsAudio?.audioBase64),
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // 8. Return Result with Sarvam Spoken Audio
      res.json({
        ...intelligenceResult,
        isMock,
        transcript: transcribedText,
        audioBase64: ttsAudio?.audioBase64,
        audioFormat: ttsAudio?.format || 'audio/wav',
        ttsProvider: ttsAudio?.provider,
        ttsSpeaker: ttsAudio?.speaker,
        ttsError,
      });
    } catch (error) {
      audioBuffer = null;

      if (error instanceof AuthorizationError) {
        res.status(403).json({ error: error.message });
        return;
      }

      if (error instanceof DamuServiceError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      safeClinicalLog('error', 'Unhandled error in Damu interaction', { error: String(error) });
      res.status(500).json({ error: 'An unexpected error occurred while processing interaction.' });
    } finally {
      audioBuffer = null;
    }
  }
);

/**
 * POST /api/damu/tts
 * Synthesizes text using Sarvam Bulbul TTS (bulbul:v4-flash).
 */
router.post(
  '/tts',
  requireAuth,
  requireFeature('P0_6_GROQ_VOICE_ASSISTANT'),
  damuRateLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { text, language, speaker } = req.body;
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Text string is required for speech synthesis.' });
        return;
      }

      const provider = getDamuProvider();
      const result = await provider.synthesizeSpeech({
        text: text.trim(),
        language,
        speaker,
      });

      res.json(result);
    } catch (error) {
      if (error instanceof DamuServiceError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      safeClinicalLog('error', 'Unhandled error in Damu TTS endpoint', { error: String(error) });
      res.status(500).json({ error: 'Failed to synthesize speech.' });
    }
  }
);

/**
 * GET /api/damu/conversations
 * List conversation sessions for the active patient.
 */
router.get('/conversations', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

    const conversations = await prisma.damuConversation.findMany({
      where: {
        userId: effectivePatientId,
        isArchived: false,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as AuthenticatedRequest).user!.id,
      action: 'DAMU_CONVERSATIONS_VIEWED',
      entityType: 'DamuConversation',
      metadata: { count: conversations.length, patientScope: effectivePatientId },
    });

    res.json({ conversations });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(403).json({ error: error.message });
      return;
    }
    safeClinicalLog('error', 'Failed to fetch Damu conversations', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

/**
 * POST /api/damu/conversations
 * Create a new conversation session.
 */
router.post('/conversations', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const { title = 'New Health Discussion', language = 'en-IN' } = req.body || {};

    const conversation = await prisma.damuConversation.create({
      data: {
        userId: effectivePatientId,
        title,
        language,
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as AuthenticatedRequest).user!.id,
      action: 'DAMU_CONVERSATION_CREATED',
      entityType: 'DamuConversation',
      entityId: conversation.id,
      metadata: { patientScope: effectivePatientId, language },
    });

    res.status(201).json(conversation);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(403).json({ error: error.message });
      return;
    }
    safeClinicalLog('error', 'Failed to create Damu conversation', { error: String(error) });
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

/**
 * GET /api/damu/conversations/:id
 * Retrieve message history for a specific conversation session.
 */
router.get('/conversations/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const conversationId = req.params.id;

    const conversation = await prisma.damuConversation.findFirst({
      where: {
        id: conversationId,
        userId: effectivePatientId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    // Format parsed sources and followups
    const formattedMessages = conversation.messages.map(m => {
      let parsedSources = [];
      let parsedFollowUps = [];
      try {
        if (m.sources) parsedSources = JSON.parse(m.sources);
      } catch {}
      try {
        if (m.suggestedFollowUps) parsedFollowUps = JSON.parse(m.suggestedFollowUps);
      } catch {}

      let transparency;
      try {
        transparency = m.transparency ? JSON.parse(m.transparency) : undefined;
      } catch {
        transparency = undefined;
      }

      return {
        ...m,
        sources: parsedSources,
        suggestedFollowUps: parsedFollowUps,
        transparency,
      };
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as AuthenticatedRequest).user!.id,
      action: 'DAMU_CONVERSATION_VIEWED',
      entityType: 'DamuConversation',
      entityId: conversation.id,
      metadata: { messageCount: conversation.messages.length, patientScope: effectivePatientId },
    });

    res.json({
      ...conversation,
      messages: formattedMessages,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(403).json({ error: error.message });
      return;
    }
    safeClinicalLog('error', 'Failed to retrieve Damu conversation', { error: String(error) });
    res.status(500).json({ error: 'Failed to retrieve conversation details.' });
  }
});

/**
 * DELETE /api/damu/conversations/:id
 * Clear/delete a conversation session (patient privacy control).
 * Does not touch clinical health records or observations.
 */
router.delete('/conversations/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const conversationId = req.params.id;

    const conversation = await prisma.damuConversation.findFirst({
      where: {
        id: conversationId,
        userId: effectivePatientId,
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    await prisma.damuConversation.delete({
      where: { id: conversationId },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: (req as AuthenticatedRequest).user!.id,
      action: 'DAMU_CONVERSATION_DELETED',
      entityType: 'DamuConversation',
      entityId: conversationId,
      metadata: { patientScope: effectivePatientId, deletionScope: 'CONVERSATION_ONLY' },
    });

    res.json({ success: true, message: 'Conversation cleared successfully.' });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      res.status(403).json({ error: error.message });
      return;
    }
    safeClinicalLog('error', 'Failed to delete Damu conversation', { error: String(error) });
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

export default router;
