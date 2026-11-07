import { z } from 'zod';

export const DamuAvatarModeEnum = z.enum(['idle', 'listening', 'thinking', 'speaking']);
export type DamuAvatarMode = z.infer<typeof DamuAvatarModeEnum>;

export const DamuSourceTypeEnum = z.enum([
  'PATIENT_RECORD',
  'EDUCATIONAL_KNOWLEDGE',
  'CLINICAL_SUMMARY',
  'CARE_PLAN',
]);
export type DamuSourceType = z.infer<typeof DamuSourceTypeEnum>;

export const DamuSourceReferenceSchema = z.object({
  id: z.string().optional(),
  type: DamuSourceTypeEnum,
  title: z.string(),
  reference: z.string(),
  date: z.string().optional(),
  content: z.string().optional(),
  confidence: z.number().optional(),
});
export type DamuSourceReference = z.infer<typeof DamuSourceReferenceSchema>;

export const DamuAnswerBasisEnum = z.enum([
  'PATIENT_RECORDS',
  'APPROVED_KNOWLEDGE',
  'PATIENT_RECORDS_AND_APPROVED_KNOWLEDGE',
  'CLINICIAN_APPROVED_RECORDS',
  'EMERGENCY_RULE',
  'SAFETY_REFUSAL',
  'INSUFFICIENT_DATA',
]);
export type DamuAnswerBasis = z.infer<typeof DamuAnswerBasisEnum>;

export const DamuTransparencySchema = z.object({
  answerBasis: DamuAnswerBasisEnum,
  confidence: z.enum(['HIGH', 'MODERATE', 'LOW']),
  confidenceReason: z.string(),
  sourceCount: z.number().int().nonnegative(),
  dataScope: z.enum(['PATIENT_SELF', 'AUTHORIZED_DELEGATE']),
  dataWindow: z.string(),
  limitations: z.array(z.string()).max(8),
  privacy: z.object({
    patientScoped: z.literal(true),
    rawAudioStored: z.literal(false),
    storageMode: z.literal('MINIMIZED_CONVERSATION_METADATA'),
  }),
});
export type DamuTransparency = z.infer<typeof DamuTransparencySchema>;

export const DamuInteractRequestSchema = z.object({
  audioBase64: z.string().optional(),
  mimeType: z.string().optional(),
  textPrompt: z.string().max(2000).optional(),
  language: z.string().default('hi-IN'),
  consentObtained: z.literal(true, {
    message: 'Explicit informed consent is required before interacting with Damu Voice Assistant.',
  }),
  consentVersion: z.string().min(1).max(64),
  conversationId: z.string().optional(),
  targetPatientId: z.string().optional(),
  reportId: z.string().uuid().optional(),
  sessionContext: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type DamuInteractRequest = z.infer<typeof DamuInteractRequestSchema>;

export const DamuInteractResponseSchema = z.object({
  conversationId: z.string().optional(),
  messageId: z.string().optional(),
  transcript: z.string().optional(),
  textResponse: z.string(),
  spokenText: z.string(),
  detectedLanguage: z.string(),
  intent: z.string(),
  avatarMode: DamuAvatarModeEnum.default('idle'),
  sources: z.array(DamuSourceReferenceSchema).default([]),
  suggestedFollowUps: z.array(z.string()).default([]),
  emergencyNotice: z.string().optional(),
  emergencyEscalation: z.boolean().default(false),
  isProhibited: z.boolean().default(false),
  audioRetentionPolicy: z.literal('SESSION_ONLY_ZERO_RETENTION'),
  isMock: z.boolean(),
  transparency: DamuTransparencySchema,
  audioBase64: z.string().optional(),
  audioFormat: z.string().optional(),
  ttsProvider: z.string().optional(),
  ttsSpeaker: z.string().optional(),
  ttsError: z.string().optional(),
});
export type DamuInteractResponse = z.infer<typeof DamuInteractResponseSchema>;

export const DamuStatusResponseSchema = z.object({
  configuredProvider: z.string(),
  isAvailable: z.boolean(),
  models: z.object({
    stt: z.string(),
    llm: z.string(),
    tts: z.string().optional(),
  }),
  ttsProvider: z.string().optional(),
  supportedLanguages: z.array(z.string()),
  audioRetentionPolicy: z.literal('SESSION_ONLY_ZERO_RETENTION'),
  clinicalDisclaimer: z.string(),
});
export type DamuStatusResponse = z.infer<typeof DamuStatusResponseSchema>;

export const DamuTtsRequestSchema = z.object({
  text: z.string().min(1).max(2000),
  language: z.string().default('en-IN'),
  speaker: z.string().optional(),
});
export type DamuTtsRequest = z.infer<typeof DamuTtsRequestSchema>;

export const DamuTtsResponseSchema = z.object({
  audioBase64: z.string(),
  format: z.string().default('audio/wav'),
  provider: z.string(),
  speaker: z.string().optional(),
});
export type DamuTtsResponse = z.infer<typeof DamuTtsResponseSchema>;

export const DamuMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sender: z.enum(['USER', 'DAMU', 'SYSTEM']),
  content: z.string(),
  intent: z.string().nullable().optional(),
  sources: z.array(DamuSourceReferenceSchema).default([]),
  suggestedFollowUps: z.array(z.string()).default([]),
  avatarMode: DamuAvatarModeEnum.nullable().optional(),
  emergencyNotice: z.boolean().default(false),
  isProhibited: z.boolean().default(false),
  transparency: DamuTransparencySchema.optional(),
  createdAt: z.string(),
});
export type DamuMessage = z.infer<typeof DamuMessageSchema>;

export const DamuConversationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  language: z.string(),
  isArchived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.array(DamuMessageSchema).optional(),
});
export type DamuConversation = z.infer<typeof DamuConversationSchema>;

