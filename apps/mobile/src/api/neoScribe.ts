
import { mobileApiFetch } from './client';

/**
 * AarogyaDamu Project 3 — NEO Scribe API client.
 *
 * Matches the existing Express routes mounted at /api/scribe.
 * This file does not perform transcription; the backend calls the
 * configured Gemini Scribe service.
 */

export type ScribeSessionStatus =
  | 'RECORDING'
  | 'PROCESSING'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED'
  | 'CANCELLED';

export type ScribeRecordingStatus =
  | 'NOT_STARTED'
  | 'RECORDING'
  | 'UPLOADING'
  | 'TRANSCRIBING'
  | 'GENERATING_NOTE'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ScribeSpeakerSegment {
  speaker: 'Doctor' | 'Patient';
  text: string;
  timestamp?: string;
}

export type StructuredClinicalNote = Record<string, unknown>;

export interface ScribeConsultation {
  id: string;
  scheduledAt: string;
  clinicianName: string;
  facilityName: string;
}

export interface AuthorizedScribePatient {
  id: string;
  fullName: string;
  diabetesType: string;
  consultations: ScribeConsultation[];
}

export interface ScribeSession {
  id: string;
  status: ScribeSessionStatus;
  recordingStatus: ScribeRecordingStatus;
  retryCount: number;
  transcript?: string;
  segments: ScribeSpeakerSegment[];
  structuredNote?: StructuredClinicalNote;
}

export interface CreateScribeSessionInput {
  patientId: string;
  consultationId: string;
  consentVersion: string;
  idempotencyKey?: string;
}

export interface ProcessScribeAudioInput {
  /**
   * Base64-encoded audio content.
   * A data URI prefix is also accepted by the current backend.
   */
  audioBase64: string;
  mimeType:
    | 'audio/webm'
    | 'audio/mp4'
    | 'audio/mpeg'
    | 'audio/wav'
    | 'audio/ogg'
    | 'audio/aac';
  durationSeconds: number;
}

export interface ApproveScribeNoteInput {
  editedStructuredNote?: StructuredClinicalNote;
  editedSegments?: ScribeSpeakerSegment[];
  approvedSummaryText?: string;
}

export interface ApprovedScribeNote {
  id: string;
  userId: string;
  clinicianId: string;
  clinicianName: string;
  status: 'APPROVED';
  approvedNoteText: string | null;
  approvedAt: string | null;
  speakerSegments: ScribeSpeakerSegment[];
  structuredNote: StructuredClinicalNote;
  [key: string]: unknown;
}

export interface ScribePatientNotesResponse {
  notes: Array<{
    id: string;
    userId: string;
    status: 'APPROVED';
    approvedNoteText: string | null;
    speakerSegments: ScribeSpeakerSegment[];
    structuredNote: StructuredClinicalNote;
    [key: string]: unknown;
  }>;
}

function requiredText(value: string, field: string): string {
  const result = value.trim();

  if (!result) {
    throw new Error(`${field} is required.`);
  }

  return result;
}

/**
 * The existing server mounts the scribe router at /api/scribe.
 *
 * Supports EXPO_PUBLIC_API_URL configured as either:
 *   http://localhost:4000
 *   http://localhost:4000/api
 *
 * On a physical phone, use your computer's reachable LAN address instead
 * of localhost. Keep this variable free of credentials.
 */
function scribeRoute(path: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL
    ?.trim()
    .replace(/\/+$/, '');

  const apiPrefix = baseUrl && /\/api$/i.test(baseUrl) ? '' : 'api/';

  return `${apiPrefix}scribe/${path.replace(/^\/+/, '')}`;
}

function patientHeaders(patientId: string): Record<string, string> {
  return {
    'X-Target-Patient-Id': requiredText(patientId, 'Patient ID'),
  };
}

/**
 * An idempotency key is used to prevent accidental duplicate sessions
 * when the user retries the create-session request.
 *
 * This key is not an authentication token or a security credential.
 */
function createIdempotencyKey(): string {
  return [
    'neo',
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2),
  ].join('-');
}

/* -------------------------------------------------------------------------- */
/* Authorized patients                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves patients that the backend makes available to this clinician.
 */
export async function listAuthorizedScribePatients(): Promise<{
  patients: AuthorizedScribePatient[];
}> {
  return mobileApiFetch<{ patients: AuthorizedScribePatient[] }>(
    scribeRoute('patients'),
    { method: 'GET' },
  );
}

/* -------------------------------------------------------------------------- */
/* Session creation and audio processing                                      */
/* -------------------------------------------------------------------------- */

/**
 * Starts an authorized consultation session.
 *
 * Patient consent must already have been obtained explicitly in the UI.
 * The backend records the consent event and validates the clinician's
 * access to the selected patient and consultation.
 */
export async function createScribeSession(
  input: CreateScribeSessionInput,
): Promise<{ session: ScribeSession }> {
  const patientId = requiredText(input.patientId, 'Patient ID');
  const consultationId = requiredText(
    input.consultationId,
    'Consultation ID',
  );
  const consentVersion = requiredText(
    input.consentVersion,
    'Consent version',
  );

  const idempotencyKey =
    input.idempotencyKey?.trim() || createIdempotencyKey();

  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    throw new Error('The idempotency key must contain 16–128 characters.');
  }

  return mobileApiFetch<{ session: ScribeSession }>(
    scribeRoute('sessions'),
    {
      method: 'POST',
      headers: patientHeaders(patientId),
      body: JSON.stringify({
        patientId,
        consultationId,
        consentObtained: true,
        consentVersion,
        idempotencyKey,
      }),
    },
  );
}

/**
 * Sends recorded audio to the existing backend processing endpoint.
 *
 * The backend validates the audio, invokes GeminiScribeService,
 * generates a structured note, and returns a pending-review draft.
 */
export async function processScribeAudio(
  sessionId: string,
  patientId: string,
  input: ProcessScribeAudioInput,
): Promise<{ session: ScribeSession }> {
  const id = requiredText(sessionId, 'Session ID');
  const targetPatientId = requiredText(patientId, 'Patient ID');

  if (!input.audioBase64.trim()) {
    throw new Error('Recorded audio is required.');
  }

  if (
    !Number.isInteger(input.durationSeconds) ||
    input.durationSeconds < 1 ||
    input.durationSeconds > 15 * 60
  ) {
    throw new Error('Recording duration must be between 1 and 900 seconds.');
  }

  const allowedMimeTypes = [
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
  ];

  if (!allowedMimeTypes.includes(input.mimeType)) {
    throw new Error('Unsupported audio format.');
  }

  return mobileApiFetch<{ session: ScribeSession }>(
    scribeRoute(`sessions/${encodeURIComponent(id)}/process`),
    {
      method: 'POST',
      headers: patientHeaders(targetPatientId),
      body: JSON.stringify({
        audioBase64: input.audioBase64,
        mimeType: input.mimeType,
        durationSeconds: input.durationSeconds,
      }),
    },
  );
}

/**
 * Cancels a session only while its current state allows cancellation.
 */
export async function cancelScribeSession(
  sessionId: string,
  patientId: string,
): Promise<{ id: string; status: 'CANCELLED' }> {
  const id = requiredText(sessionId, 'Session ID');

  return mobileApiFetch<{ id: string; status: 'CANCELLED' }>(
    scribeRoute(`sessions/${encodeURIComponent(id)}/cancel`),
    {
      method: 'POST',
      headers: patientHeaders(patientId),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Clinician review                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Approves the current pending-review note after the clinician has
 * reviewed and corrected the transcript and structured note.
 */
export async function approveScribeNote(
  sessionId: string,
  patientId: string,
  input: ApproveScribeNoteInput = {},
): Promise<{ approvedNote: ApprovedScribeNote }> {
  const id = requiredText(sessionId, 'Session ID');

  if (
    input.approvedSummaryText !== undefined &&
    input.approvedSummaryText.length > 20_000
  ) {
    throw new Error('The approved summary is too long.');
  }

  return mobileApiFetch<{ approvedNote: ApprovedScribeNote }>(
    scribeRoute(`${encodeURIComponent(id)}/approve`),
    {
      method: 'POST',
      headers: patientHeaders(patientId),
      body: JSON.stringify(input),
    },
  );
}

/**
 * Rejects a pending-review draft with a mandatory reason.
 */
export async function rejectScribeNote(
  sessionId: string,
  patientId: string,
  reason: string,
): Promise<{ id: string; status: 'REJECTED' }> {
  const id = requiredText(sessionId, 'Session ID');
  const rejectionReason = requiredText(reason, 'Rejection reason');

  if (rejectionReason.length > 2_000) {
    throw new Error('The rejection reason must not exceed 2,000 characters.');
  }

  return mobileApiFetch<{ id: string; status: 'REJECTED' }>(
    scribeRoute(`${encodeURIComponent(id)}/reject`),
    {
      method: 'POST',
      headers: patientHeaders(patientId),
      body: JSON.stringify({ reason: rejectionReason }),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Approved patient timeline                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Retrieves approved notes only.
 * The backend applies its clinician and patient authorization checks.
 */
export async function getApprovedScribeNotes(
  patientId: string,
): Promise<ScribePatientNotesResponse> {
  const id = requiredText(patientId, 'Patient ID');

  return mobileApiFetch<ScribePatientNotesResponse>(
    scribeRoute(`patient/${encodeURIComponent(id)}`),
    {
      method: 'GET',
      headers: patientHeaders(id),
    },
  );
}
