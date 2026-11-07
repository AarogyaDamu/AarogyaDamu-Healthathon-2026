import { env } from '../config/env';
import { classifyAgentIntent } from '../ai/safety/riskClassifier';

export interface DamuProviderStatus {
  configuredProvider: string;
  isAvailable: boolean;
  models: {
    stt: string;
    llm: string;
    tts?: string;
  };
  ttsProvider?: string;
  supportedLanguages: string[];
  audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION';
  clinicalDisclaimer: string;
}

export interface PatientVoiceContext {
  fullName?: string | null;
  diabetesType?: string | null;
  targetHbA1c?: number | null;
  recentGlucose?: number | null;
  recentGlucoseContext?: string | null;
}

export interface DamuInteractionResult {
  transcript?: string;
  textResponse: string;
  spokenText: string;
  detectedLanguage: string;
  intent: string;
  emergencyNotice?: string;
  audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION';
  isMock: boolean;
  audioBase64?: string;
  audioFormat?: string;
  ttsProvider?: string;
  ttsSpeaker?: string;
  ttsError?: string;
}

export interface DamuVoiceProvider {
  readonly name: string;
  transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<{ transcript: string; detectedLanguage: string }>;
  generateResponse(params: {
    prompt: string;
    transcript?: string;
    language?: string;
    patientContext?: PatientVoiceContext;
  }): Promise<{
    textResponse: string;
    spokenText: string;
    intent: string;
    emergencyNotice?: string;
    isMock: boolean;
  }>;
  synthesizeSpeech(params: {
    text: string;
    language?: string;
    speaker?: string;
  }): Promise<{
    audioBase64: string;
    format: string;
    provider: string;
    speaker: string;
  }>;
  getProviderStatus(): Promise<DamuProviderStatus>;
}

export class DamuServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 413 | 502 | 503
  ) {
    super(message);
    this.name = 'DamuServiceError';
  }
}

export const CLINICAL_DISCLAIMER =
  'Damu is an AI diabetes companion designed for education and care plan comprehension. Damu is not a doctor and cannot diagnose medical conditions, prescribe medication, or alter insulin dosage. For acute symptoms or medical emergencies, call emergency services immediately (112 / 108).';

export const SUPPORTED_LANGUAGES = [
  'en-IN',
  'hi-IN',
  'te-IN',
  'ta-IN',
  'kn-IN',
  'bn-IN',
  'mr-IN',
  'gu-IN',
];

const GROQ_STT_MODEL = 'whisper-large-v3-turbo';
const GROQ_LLM_MODEL = 'openai/gpt-oss-120b';

/**
 * Redacts any occurrence of API keys from error messages and logs.
 */
export function redactApiKey(str: string, apiKey?: string): string {
  let sanitized = str;
  if (apiKey && apiKey.length > 5) {
    sanitized = sanitized.split(apiKey).join('[REDACTED_API_KEY]');
  }
  sanitized = sanitized.replace(/gsk_[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/sk_[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]');
  return sanitized;
}

export const SARVAM_STT_MODEL = 'saarika:v2';
export const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
export const SARVAM_TTS_DEFAULT_MODEL = 'bulbul:v4-flash';
export const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
export const SARVAM_TTS_DEFAULT_SPEAKER = 'shubh_enhi_ads';

export const SARVAM_LANGUAGE_SPEAKERS: Record<string, string> = {
  'en-IN': 'shubh_enhi_ads',
  'hi-IN': 'shubh_enhi_ads',
  'mr-IN': 'shubh_enhi_ads',
  'bn-IN': 'shubh_enhi_ads',
  'ta-IN': 'shubh_enhi_ads',
  'te-IN': 'shubh_enhi_ads',
  'kn-IN': 'shubh_enhi_ads',
  'gu-IN': 'shubh_enhi_ads',
  'pa-IN': 'shubh_enhi_ads',
  'ml-IN': 'shubh_enhi_ads',
  'od-IN': 'shubh_enhi_ads',
};

export interface NormalizedAudio {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  filename: string;
  detectedFormat: 'mp4' | 'wav' | 'webm' | 'mp3' | 'aac' | 'ogg' | 'unknown';
}

/**
 * Validates audio non-emptiness, inspects container magic bytes to avoid mislabeling,
 * and normalizes the MIME type and filename extension for Sarvam and Groq STT APIs.
 *
 * Sarvam explicitly accepts: audio/mp4, audio/x-m4a, audio/wav, audio/webm, audio/mpeg.
 * Sending 'audio/m4a' causes Sarvam HTTP 400 'Invalid file type: audio/m4a'.
 */
export function detectAndNormalizeAudio(
  audioBuffer: Buffer,
  requestedMime?: string
): NormalizedAudio {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new DamuServiceError('Audio payload cannot be empty.', 400);
  }

  const len = audioBuffer.length;
  let detectedFormat: 'mp4' | 'wav' | 'webm' | 'mp3' | 'aac' | 'ogg' | 'unknown' = 'unknown';

  // 1. Inspect magic bytes
  // MP4 / M4A (ISO BMFF): bytes 4..8 === 'ftyp' (0x66, 0x74, 0x79, 0x70)
  if (len >= 8 && audioBuffer[4] === 0x66 && audioBuffer[5] === 0x74 && audioBuffer[6] === 0x79 && audioBuffer[7] === 0x70) {
    detectedFormat = 'mp4';
  }
  // WAV: bytes 0..4 === 'RIFF' and 8..12 === 'WAVE'
  else if (len >= 12 && audioBuffer.toString('ascii', 0, 4) === 'RIFF' && audioBuffer.toString('ascii', 8, 12) === 'WAVE') {
    detectedFormat = 'wav';
  }
  // WebM / EBML: 0x1A 0x45 0xDF 0xA3
  else if (len >= 4 && audioBuffer[0] === 0x1a && audioBuffer[1] === 0x45 && audioBuffer[2] === 0xdf && audioBuffer[3] === 0xa3) {
    detectedFormat = 'webm';
  }
  // MP3 with ID3 tag: 'ID3' (0x49 0x44 0x33)
  else if (len >= 3 && audioBuffer.toString('ascii', 0, 3) === 'ID3') {
    detectedFormat = 'mp3';
  }
  // MPEG audio sync frame or ADTS AAC
  else if (len >= 2 && audioBuffer[0] === 0xff && (audioBuffer[1] & 0xe0) === 0xe0) {
    if ((audioBuffer[1] & 0x16) === 0x10) {
      detectedFormat = 'aac';
    } else {
      detectedFormat = 'mp3';
    }
  }
  // OGG: 'OggS'
  else if (len >= 4 && audioBuffer.toString('ascii', 0, 4) === 'OggS') {
    detectedFormat = 'ogg';
  }

  // 2. Resolve final MIME type and file extension supported by Sarvam and Groq
  let mimeType: string;
  let extension: string;

  if (detectedFormat === 'mp4') {
    // Genuine MP4/M4A audio container.
    // Sarvam STT requires 'audio/mp4' or 'audio/x-m4a' (rejects 'audio/m4a' with 400).
    mimeType = 'audio/mp4';
    extension = 'mp4';
  } else if (detectedFormat === 'wav') {
    mimeType = 'audio/wav';
    extension = 'wav';
  } else if (detectedFormat === 'webm') {
    mimeType = 'audio/webm';
    extension = 'webm';
  } else if (detectedFormat === 'mp3') {
    mimeType = 'audio/mpeg';
    extension = 'mp3';
  } else if (detectedFormat === 'aac') {
    mimeType = 'audio/aac';
    extension = 'aac';
  } else if (detectedFormat === 'ogg') {
    mimeType = 'audio/ogg';
    extension = 'ogg';
  } else {
    // Magic bytes unknown (e.g. streaming chunks or mock text buffer); normalize requestedMime safely
    const req = (requestedMime || '').toLowerCase().trim();
    if (req.includes('m4a') || req.includes('mp4')) {
      mimeType = 'audio/mp4';
      extension = 'mp4';
    } else if (req.includes('wav')) {
      mimeType = 'audio/wav';
      extension = 'wav';
    } else if (req.includes('webm')) {
      mimeType = 'audio/webm';
      extension = 'webm';
    } else if (req.includes('mp3') || req.includes('mpeg')) {
      mimeType = 'audio/mpeg';
      extension = 'mp3';
    } else if (req.includes('aac')) {
      mimeType = 'audio/aac';
      extension = 'aac';
    } else {
      mimeType = 'audio/mp4';
      extension = 'mp4';
    }
  }

  const filename = `voice_input_${Date.now()}.${extension}`;
  return {
    buffer: audioBuffer,
    mimeType,
    extension,
    filename,
    detectedFormat,
  };
}

/**
 * Creates a valid PCM 16-bit Mono WAV buffer for deterministic tests and mock synthesis.
 */
export function createMockWavBuffer(sampleRate = 22050, numSamples = 100): Buffer {
  const dataSize = numSamples * 2;
  const fileSize = 44 + dataSize;
  const buffer = Buffer.alloc(fileSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize - 8, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = Mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * Prepares clean, unformatted text for natural speech synthesis.
 * Strips markdown symbols, asterisks, bullet points, URLs, and limits length.
 */
export function sanitizeTextForTts(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/`{1,3}.*?`{1,3}/gs, '')
    .replace(/[#*_~`>[\]()]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Spoken number words mapping for regional and English voice inputs.
 */
const SPOKEN_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Parses spoken number words, explicit mg/dL and mmol/L glucose values,
 * while strictly rejecting timestamp and duration false-positives.
 */
export function parseSpokenOrNumericGlucose(text: string, fallbackGlucoseReading?: number | null): number | undefined {
  const lower = text.toLowerCase();

  // 1. Spoken compound word numbers (e.g. "forty two", "forty-two", "thirty five") with glucose context
  const spokenMatch = lower.match(/(?:sugar|glucose|reading|level)\s*(?:is|was|at|of)?\s*(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/i);
  if (spokenMatch) {
    const tens = SPOKEN_NUMBERS[spokenMatch[1].toLowerCase()] || 0;
    const units = spokenMatch[2] ? (SPOKEN_NUMBERS[spokenMatch[2].toLowerCase()] || 0) : 0;
    const total = tens + units;
    if (total > 0) return total;
  }

  // 2. Unit-specified readings (e.g. "2.8 mmol/L" or "45 mg/dL")
  // mmol/L conversion: 1 mmol/L = 18.018 mg/dL
  const mmolMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:mmol\/l|mmol|millimoles?(?:\/l)?)\b/i);
  if (mmolMatch) {
    const mmolVal = parseFloat(mmolMatch[1]);
    if (!isNaN(mmolVal) && mmolVal > 0) {
      return Math.round(mmolVal * 18.018);
    }
  }

  const mgdlMatch = lower.match(/\b(\d{2,3})\s*(?:mg\/dl|mgdl)\b/i);
  if (mgdlMatch) {
    const mgdlVal = parseInt(mgdlMatch[1], 10);
    if (!isNaN(mgdlVal) && mgdlVal > 0) {
      return mgdlVal;
    }
  }

  // 3. Numeric reading with context keyword (e.g. "sugar is 45", "reading was 52")
  // Exclude timestamp/duration false positives (e.g. "at 10 pm", "at 4:30 pm", "10 minutes ago", "for 2 hours")
  const contextNumericMatches = lower.matchAll(/(?:sugar|glucose|reading|level)\s*(?:is|was|at|of)?\s*(\d{1,3})(:\d+)?\b/gi);
  for (const match of contextNumericMatches) {
    // If the number was part of a time like "4:30", skip
    if (match[2]) {
      continue;
    }
    const val = parseInt(match[1], 10);
    const matchIndex = match.index ?? 0;
    const followingText = lower.slice(matchIndex + match[0].length, matchIndex + match[0].length + 15);
    // If followed by time markers (am, pm, o'clock, min, hour, :xx), reject
    if (/^\s*(?::\d+|am|pm|o'clock|minutes?|mins?|hours?|hrs?)\b/i.test(followingText)) {
      continue;
    }
    // If preceded by "at " and followed by time like "at 4 pm"
    const fullSnippet = lower.slice(Math.max(0, matchIndex - 8), matchIndex + match[0].length + 10);
    if (/\bat\s+\d+(?::\d+)?\s*(?:am|pm)\b/i.test(fullSnippet)) {
      continue;
    }
    if (val > 0) {
      return val;
    }
  }

  // 4. Fallback to historical database reading if provided and no active reading spoken in text
  if (fallbackGlucoseReading !== undefined && fallbackGlucoseReading !== null && fallbackGlucoseReading > 0) {
    return fallbackGlucoseReading;
  }

  return undefined;
}

/**
 * Determines if a reported symptom is explicitly negated in the prompt
 * (e.g., "I do not have chest pain", "no seizure", "denies fainting").
 */
export function isSymptomNegated(text: string, symptom: string): boolean {
  const lower = text.toLowerCase();
  const index = lower.indexOf(symptom.toLowerCase());
  if (index === -1) return false;

  const windowBefore = lower.slice(Math.max(0, index - 35), index);
  const lastButIndex = Math.max(
    windowBefore.lastIndexOf('but'),
    windowBefore.lastIndexOf('however'),
    windowBefore.lastIndexOf('except')
  );
  const effectiveWindow = lastButIndex !== -1 ? windowBefore.slice(lastButIndex + 3) : windowBefore;

  const negationPattern = /\b(?:no|not|without|denies|denied|never|free of|negative for|neither|nor|don't|dont|didn't|didnt|haven't|havent)\b/i;
  return negationPattern.test(effectiveWindow);
}

/**
 * Detects whether a question is purely educational or hypothetical
 * (e.g. "What happens during a seizure?") vs an active clinical emergency.
 */
export function isPurelyHypothetical(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Active personal distress signals immediately disqualify hypothetical interpretation
  const activeDistressIndicators = [
    /\bi\s+(?:have|feel|am|'m|can't|cannot)\b/i,
    /\bmy\s+(?:sugar|glucose|chest|reading|level|symptom)\b/i,
    /\b(?:help|emergency|right now|currently|experiencing|suffering|started having)\b/i,
    /\bpatient\s+(?:is|has|appears)\b/i,
  ];

  for (const indicator of activeDistressIndicators) {
    if (indicator.test(lower)) {
      return false;
    }
  }

  // Educational inquiry patterns
  const educationalPatterns = [
    /^(?:what\s+(?:is|are|happens|causes|does)|how\s+(?:does|do|can|is)|why\s+(?:do|does|is)|can\s+you\s+explain|could\s+you\s+explain|tell\s+me\s+about|explain|define|meaning\s+of|signs\s+of|symptoms\s+of)\b/i,
    /\?$/,
  ];

  for (const pattern of educationalPatterns) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects impaired consciousness or swallowing impairment (SEC-01).
 * When present, oral intake is strictly contraindicated due to aspiration risk.
 */
export function detectImpairedConsciousnessOrSwallowing(text: string): boolean {
  const lower = text.toLowerCase();
  const impairedKeywords = [
    'unconscious',
    'passed out',
    'passing out',
    'fainted',
    'fainting',
    'unresponsive',
    'blacked out',
    'blacking out',
    'coma',
    'loss of consciousness',
    'seizure',
    'seizing',
    'convulsion',
    'convulsions',
    'convulsing',
    'fits',
    'unable to swallow',
    'cannot swallow',
    "can't swallow",
    'difficulty swallowing',
    'swallowing difficulty',
    'choking',
  ];

  for (const kw of impairedKeywords) {
    if (lower.includes(kw) && !isSymptomNegated(lower, kw)) {
      return true;
    }
  }

  return false;
}

/**
 * Detects non-negated acute symptoms (chest pain, shortness of breath).
 */
export function detectAcuteSymptoms(text: string): string[] {
  const lower = text.toLowerCase();
  const acuteKeywords = [
    'chest pain',
    'pressure in chest',
    'cannot breathe',
    'shortness of breath',
    'severe breathlessness',
    'struggling to breathe',
    'severe low sugar',
    'dizziness and confusion',
  ];

  const found: string[] = [];
  for (const kw of acuteKeywords) {
    if (lower.includes(kw) && !isSymptomNegated(lower, kw)) {
      found.push(kw);
    }
  }
  return found;
}

/**
 * Emergency symptom and threshold detection with strict clinical safety precedence.
 * 1. Airway / Consciousness impairment: oral intake prohibited (aspiration hazard); call 112/108; recovery position.
 * 2. Severe hypoglycemia (<54 mg/dL): fast carbs only if conscious and able to swallow; Rule of 15.
 * 3. Acute red-flag medical emergencies: immediate 112/108 dispatch.
 */
export function evaluateEmergencyConditions(text: string, glucoseReading?: number | null): string | undefined {
  const lower = text.toLowerCase().trim();

  // 0. Educational / Hypothetical inquiries without personal distress do not trigger emergency alarms
  if (isPurelyHypothetical(lower)) {
    return undefined;
  }

  // 1. Detect glucose level (numeric, spoken, or mmol/L converted)
  const detectedGlucose = parseSpokenOrNumericGlucose(lower, glucoseReading);

  // 2. Assess airway & consciousness
  const hasImpairedConsciousness = detectImpairedConsciousnessOrSwallowing(lower);

  // PRECEDENCE 1 (SEC-01): Impaired consciousness or swallowing (Absolute Aspiration Hazard Precaution)
  if (hasImpairedConsciousness) {
    return 'CRITICAL NOTICE: Impaired consciousness or swallowing difficulty detected. DO NOT administer any food, fluids, or oral glucose by mouth due to acute choking and aspiration hazard. Immediately call emergency services (112 / 108). Place the patient on their side in the recovery position to keep the airway clear. Administer prescribed emergency glucagon only if available and if a caregiver has been trained.';
  }

  // PRECEDENCE 2 (SEC-01 & SEC-06): Severe Hypoglycemia (<54 mg/dL) with NORMAL consciousness
  if (detectedGlucose !== undefined && detectedGlucose !== null && detectedGlucose > 0 && detectedGlucose < 54) {
    return 'CRITICAL EMERGENCY: Severe hypoglycemia (<54 mg/dL) detected. If the person is fully awake, alert, and able to swallow safely: consume 15-20g of fast-acting glucose immediately (e.g. 4 glucose tablets, 1/2 cup fruit juice, or 3-4 teaspoons sugar). Recheck blood sugar in 15 minutes (Rule of 15). If readings remain below 70 mg/dL or symptoms worsen, call local emergency services (112 or 108) or your emergency contact immediately.';
  }

  // PRECEDENCE 3 (SEC-05): Acute red-flag medical emergencies (chest pain, severe dyspnea)
  const acuteSymptoms = detectAcuteSymptoms(lower);
  if (acuteSymptoms.length > 0) {
    return 'CRITICAL NOTICE: Your reported symptoms indicate an urgent medical situation. Please immediately call emergency services (112 / 108) or consult your emergency contact.';
  }

  return undefined;
}

/**
 * Prohibited clinical intent evaluation.
 * Enforces strict non-doctor boundary: no prescribing, diagnosing, or dose adjustment.
 */
export function evaluateProhibitedIntent(text: string): { isProhibited: boolean; reason?: string } {
  const lower = text.toLowerCase();

  // Explicit safety classification via centralized risk classifier
  const classification = classifyAgentIntent('VOICE_USER_QUERY', { query: text });
  if (classification.riskTier === 'PROHIBITED') {
    return {
      isProhibited: true,
      reason: classification.reason,
    };
  }

  // Guard against direct dose alteration, insulin changes, or diagnoses
  const prohibitedPhrases = [
    'change my insulin',
    'increase my insulin',
    'decrease my insulin',
    'adjust my dose',
    'change my dose',
    'prescribe',
    'diagnose me',
    'what disease do i have',
    'stop taking my medication',
    'increase metformin',
    'alter my prescription',
  ];

  for (const phrase of prohibitedPhrases) {
    if (lower.includes(phrase)) {
      return {
        isProhibited: true,
        reason: 'Autonomous medical diagnosis, prescription, or dosage alteration without clinician approval is strictly prohibited.',
      };
    }
  }

  return { isProhibited: false };
}

/* -------------------------------------------------------------------------- */
/* 1. Groq Voice Assistant Provider                                           */
/* -------------------------------------------------------------------------- */

/**
 * Executes an HTTP fetch with request timeout (10s), bounded exponential backoff
 * (up to 2 retries for transient 429/503 errors and network failures), and API key sanitization.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  apiKey: string,
  maxRetries = 2,
  baseDelayMs = 500
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s request timeout
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Bounded retry on 429 (Rate Limit) or 503 (Service Unavailable)
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        attempt++;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (attempt < maxRetries) {
        attempt++;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      const rawMsg = err?.name === 'AbortError' ? 'Request timed out after 10000ms' : String(err?.message || err);
      const safeMsg = redactApiKey(rawMsg, apiKey);
      throw new DamuServiceError(`Groq request failed after ${attempt} retries: ${safeMsg}`, 502);
    }
  }
}

export class GroqDamuProvider implements DamuVoiceProvider {
  readonly name = 'groq-llama3.3-whisper-turbo';

  constructor(private readonly apiKey: string) { }

  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<{ transcript: string; detectedLanguage: string }> {
    try {
      const normalized = detectAndNormalizeAudio(audioBuffer, mimeType);

      // Convert language code like 'hi-IN' -> 'hi' for Groq Whisper
      const whisperLang = language ? language.split('-')[0].toLowerCase() : undefined;

      const formData = new FormData();
      formData.append(
        'file',
        new Blob([normalized.buffer], { type: normalized.mimeType }),
        normalized.filename
      );
      formData.append('model', GROQ_STT_MODEL);
      formData.append('response_format', 'json');
      if (whisperLang) {
        formData.append('language', whisperLang);
      }

      const response = await fetchWithRetry(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: formData,
        },
        this.apiKey
      );

      if (!response.ok) {
        const errorText = await response.text();
        const safeError = redactApiKey(errorText, this.apiKey);
        throw new DamuServiceError(`Groq Whisper transcription failed (${response.status}): ${safeError}`, 502);
      }

      const data = (await response.json()) as { text: string; language?: string };
      return {
        transcript: (data.text || '').trim(),
        detectedLanguage: language || (data.language ? `${data.language}-IN` : 'en-IN'),
      };
    } catch (error) {
      if (error instanceof DamuServiceError) throw error;
      const safeError = redactApiKey(String(error), this.apiKey);
      throw new DamuServiceError(`Groq audio transcription service unavailable: ${safeError}`, 502);
    }
  }

  async generateResponse(params: {
    prompt: string;
    transcript?: string;
    language?: string;
    patientContext?: PatientVoiceContext;
  }): Promise<{
    textResponse: string;
    spokenText: string;
    intent: string;
    emergencyNotice?: string;
    isMock: boolean;
  }> {
    const effectivePrompt = (params.prompt || params.transcript || '').trim();
    if (!effectivePrompt) {
      throw new DamuServiceError('A speech transcript or text prompt is required.', 400);
    }

    // 1. Emergency Detection
    const emergencyNotice = evaluateEmergencyConditions(effectivePrompt, params.patientContext?.recentGlucose);

    // 2. Prohibited Intent Evaluation
    const prohibitedCheck = evaluateProhibitedIntent(effectivePrompt);
    if (prohibitedCheck.isProhibited) {
      const refusal = `I understand you are asking about adjusting your medication or seeking a clinical diagnosis, but as your diabetes companion Damu, I am not licensed to diagnose conditions, prescribe medications, or adjust your insulin dosage. Please consult your treating doctor or diabetes educator before making any changes to your treatment plan.`;
      return {
        textResponse: refusal,
        spokenText: refusal,
        intent: 'PROHIBITED_ACTION_REFUSAL',
        emergencyNotice,
        isMock: false,
      };
    }

    // 3. Groq Llama 3.3 Chat Completion
    const systemPrompt = `You are Damu, a warm, culturally respectful, multilingual AI diabetes companion for AarogyaDamu.
Your goal is to support patients with diabetes education, lifestyle awareness (diet, physical activity, sleep), and care plan comprehension.
CRITICAL SAFETY BOUNDARIES:
- You are NOT a doctor and cannot diagnose, prescribe, adjust insulin dosages, or alter prescriptions.
- If the patient asks for medication changes, politely refuse and instruct them to contact their physician.
- Keep responses concise (under 3-4 sentences), encouraging, and suitable for text-to-speech listening.
- Patient context: ${params.patientContext ? JSON.stringify(params.patientContext) : 'Not provided'}.
Language: reply naturally in the patient's selected language (${params.language || 'en-IN'}).`;

    try {
      const response = await fetchWithRetry(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: GROQ_LLM_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: effectivePrompt },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        },
        this.apiKey
      );

      if (!response.ok) {
        const errorText = await response.text();
        const safeError = redactApiKey(errorText, this.apiKey);
        throw new DamuServiceError(`Groq Chat completion failed (${response.status}): ${safeError}`, 502);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText = data.choices?.[0]?.message?.content?.trim() || 'I am here to help you understand your diabetes care plan.';

      return {
        textResponse: rawText,
        spokenText: rawText,
        intent: emergencyNotice ? 'EMERGENCY_ESCALATION' : 'DIABETES_EDUCATION',
        emergencyNotice,
        isMock: false,
      };
    } catch (error) {
      if (error instanceof DamuServiceError) throw error;
      const safeError = redactApiKey(String(error), this.apiKey);
      throw new DamuServiceError(`Groq Chat completion service unavailable: ${safeError}`, 502);
    }
  }

  async synthesizeSpeech(_params: {
    text: string;
    language?: string;
    speaker?: string;
  }): Promise<{
    audioBase64: string;
    format: string;
    provider: string;
    speaker: string;
  }> {
    throw new DamuServiceError(
      'Groq does not provide text-to-speech. Configure SARVAM_API_KEY for Sarvam Bulbul voice synthesis.',
      503
    );
  }

  async getProviderStatus(): Promise<DamuProviderStatus> {
    return {
      configuredProvider: 'Groq (Whisper large v3 turbo + Llama 3.3 70B)',
      isAvailable: Boolean(this.apiKey),
      models: {
        stt: GROQ_STT_MODEL,
        llm: GROQ_LLM_MODEL,
        tts: 'none',
      },
      ttsProvider: 'none',
      supportedLanguages: SUPPORTED_LANGUAGES,
      audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Sarvam AI Voice Provider (STT via Saarika v2 + LLM via Groq fallback)  */
/* -------------------------------------------------------------------------- */

/**
 * SarvamDamuProvider uses the Sarvam AI API for speech-to-text transcription
 * (supporting Indian languages natively) and falls back to Groq Llama 3.3 for
 * the response generation, since Sarvam does not expose a chat-completion API.
 *
 * STT:  POST https://api.sarvam.ai/speech-to-text  (Saarika v2)
 * LLM:  POST https://api.groq.com/openai/v1/chat/completions (Llama 3.3 70B via groqKey)
 * Auth: api-subscription-key header for Sarvam; Bearer token for Groq.
 */
export class SarvamDamuProvider implements DamuVoiceProvider {
  readonly name = 'sarvam-saarika-v2';

  constructor(
    private readonly sarvamKey: string,
    private readonly groqKey?: string
  ) { }

  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<{ transcript: string; detectedLanguage: string }> {
    try {
      const normalized = detectAndNormalizeAudio(audioBuffer, mimeType);

      // Sarvam expects BCP-47 language code like 'hi-IN'; default to 'hi-IN' for Indian users
      const languageCode = language || 'hi-IN';

      const formData = new FormData();
      formData.append(
        'file',
        new Blob([normalized.buffer], { type: normalized.mimeType }),
        normalized.filename
      );
      formData.append('model', env.SARVAM_STT_MODEL || SARVAM_STT_MODEL);
      formData.append('language_code', languageCode);

      const response = await fetchWithRetry(
        SARVAM_STT_URL,
        {
          method: 'POST',
          headers: {
            'api-subscription-key': this.sarvamKey,
          },
          body: formData,
        },
        this.sarvamKey
      );

      if (!response.ok) {
        const errorText = await response.text();
        const safeError = redactApiKey(errorText, this.sarvamKey);
        throw new DamuServiceError(
          `Sarvam STT transcription failed (${response.status}): ${safeError}`,
          502
        );
      }

      // Sarvam returns: { transcript: string, language_code: string, ... }
      const data = (await response.json()) as { transcript?: string; language_code?: string };
      return {
        transcript: (data.transcript || '').trim(),
        detectedLanguage: data.language_code || languageCode,
      };
    } catch (error) {
      if (error instanceof DamuServiceError) throw error;
      const safeError = redactApiKey(String(error), this.sarvamKey);
      throw new DamuServiceError(`Sarvam audio transcription service unavailable: ${safeError}`, 502);
    }
  }

  async generateResponse(params: {
    prompt: string;
    transcript?: string;
    language?: string;
    patientContext?: PatientVoiceContext;
  }): Promise<{
    textResponse: string;
    spokenText: string;
    intent: string;
    emergencyNotice?: string;
    isMock: boolean;
  }> {
    const effectivePrompt = (params.prompt || params.transcript || '').trim();
    if (!effectivePrompt) {
      throw new DamuServiceError('A speech transcript or text prompt is required.', 400);
    }

    // 1. Emergency Detection
    const emergencyNotice = evaluateEmergencyConditions(effectivePrompt, params.patientContext?.recentGlucose);

    // 2. Prohibited Intent Evaluation
    const prohibitedCheck = evaluateProhibitedIntent(effectivePrompt);
    if (prohibitedCheck.isProhibited) {
      const refusal = `I understand you are asking about adjusting your medication or seeking a clinical diagnosis, but as your diabetes companion Damu, I am not licensed to diagnose conditions, prescribe medications, or adjust your insulin dosage. Please consult your treating doctor or diabetes educator before making any changes to your treatment plan.`;
      return {
        textResponse: refusal,
        spokenText: refusal,
        intent: 'PROHIBITED_ACTION_REFUSAL',
        emergencyNotice,
        isMock: false,
      };
    }

    // 3. Use Groq Llama 3.3 for chat completion (Sarvam doesn't have a chat API)
    if (!this.groqKey) {
      // Graceful degradation: return a helpful static response if Groq is not configured
      const fallback = `Namaste! I am Damu, your diabetes care companion. How can I support your health journey today?`;
      return {
        textResponse: fallback,
        spokenText: fallback,
        intent: 'INFORMATIONAL_QUERY',
        emergencyNotice,
        isMock: true,
      };
    }

    const systemPrompt = `You are Damu, a warm, culturally respectful, multilingual AI diabetes companion for AarogyaDamu.
Your goal is to support patients with diabetes education, lifestyle awareness (diet, physical activity, sleep), and care plan comprehension.
CRITICAL SAFETY BOUNDARIES:
- You are NOT a doctor and cannot diagnose, prescribe, adjust insulin dosages, or alter prescriptions.
- If the patient asks for medication changes, politely refuse and instruct them to contact their physician.
- Keep responses concise (under 3-4 sentences), encouraging, and suitable for text-to-speech listening.
- Patient context: ${params.patientContext ? JSON.stringify(params.patientContext) : 'Not provided'}.
Language: reply naturally in the patient's selected language (${params.language || 'hi-IN'}).`;

    try {
      const response = await fetchWithRetry(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.groqKey}`,
          },
          body: JSON.stringify({
            model: GROQ_LLM_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: effectivePrompt },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        },
        this.groqKey
      );

      if (!response.ok) {
        const errorText = await response.text();
        const safeError = redactApiKey(errorText, this.groqKey);
        throw new DamuServiceError(`Groq Chat completion failed (${response.status}): ${safeError}`, 502);
      }

      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText =
        data.choices?.[0]?.message?.content?.trim() ||
        'I am here to help you understand your diabetes care plan.';

      return {
        textResponse: rawText,
        spokenText: rawText,
        intent: emergencyNotice ? 'EMERGENCY_ESCALATION' : 'DIABETES_EDUCATION',
        emergencyNotice,
        isMock: false,
      };
    } catch (error) {
      if (error instanceof DamuServiceError) throw error;
      const safeError = redactApiKey(String(error), this.groqKey);
      throw new DamuServiceError(`Groq Chat completion service unavailable: ${safeError}`, 502);
    }
  }

  async synthesizeSpeech(params: {
    text: string;
    language?: string;
    speaker?: string;
  }): Promise<{
    audioBase64: string;
    format: string;
    provider: string;
    speaker: string;
  }> {
    const cleanText = sanitizeTextForTts(params.text);
    if (!cleanText) {
      throw new DamuServiceError('Text cannot be empty for voice synthesis.', 400);
    }

    const targetLang = params.language || 'en-IN';
    const speaker =
      params.speaker ||
      env.SARVAM_TTS_SPEAKER ||
      SARVAM_LANGUAGE_SPEAKERS[targetLang] ||
      SARVAM_TTS_DEFAULT_SPEAKER;
    const model = env.SARVAM_TTS_MODEL || SARVAM_TTS_DEFAULT_MODEL;

    const payload: Record<string, any> = {
      inputs: [cleanText],
      target_language_code: targetLang,
      speaker,
      model,
      pace: 1.0,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
    };

    const response = await fetchWithRetry(
      SARVAM_TTS_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': this.sarvamKey,
        },
        body: JSON.stringify(payload),
      },
      this.sarvamKey
    );

    if (!response.ok) {
      const errorText = await response.text();
      const safeError = redactApiKey(errorText, this.sarvamKey);
      throw new DamuServiceError(
        `Sarvam Bulbul TTS failed (${response.status}): ${safeError}`,
        502
      );
    }

    const data = (await response.json()) as { audios?: string[] };
    if (!data.audios || !data.audios.length || !data.audios[0]) {
      throw new DamuServiceError('Sarvam TTS returned an empty audio response.', 502);
    }

    console.log(
      `[Damu TTS] Synthesized speech with Sarvam Bulbul (model: ${model}, speaker: ${speaker}, lang: ${targetLang}, len: ${data.audios[0].length})`
    );

    return {
      audioBase64: data.audios[0],
      format: 'audio/wav',
      provider: `sarvam:${model}`,
      speaker,
    };
  }

  async getProviderStatus(): Promise<DamuProviderStatus> {
    const ttsModel = env.SARVAM_TTS_MODEL || SARVAM_TTS_DEFAULT_MODEL;
    return {
      configuredProvider: 'Sarvam AI (Saarika v2 STT + Bulbul v4 Flash TTS) + Groq (Llama 3.3 LLM)',
      isAvailable: Boolean(this.sarvamKey),
      models: {
        stt: env.SARVAM_STT_MODEL || SARVAM_STT_MODEL,
        llm: GROQ_LLM_MODEL,
        tts: ttsModel,
      },
      ttsProvider: `sarvam:${ttsModel}`,
      supportedLanguages: SUPPORTED_LANGUAGES,
      audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Deterministic Mock Damu Provider (For Testing & Offline Fallback)       */
/* -------------------------------------------------------------------------- */
export class MockDamuProvider implements DamuVoiceProvider {
  readonly name = 'mock-damu-provider';

  async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string
  ): Promise<{ transcript: string; detectedLanguage: string }> {
    const normalized = detectAndNormalizeAudio(audioBuffer, mimeType);
    // If the buffer contains printable text (e.g. from tests), decode it
    const decoded = normalized.buffer.toString('utf-8');
    if (decoded && !/[\x00-\x08\x0E-\x1F]/.test(decoded)) {
      return {
        transcript: decoded.trim(),
        detectedLanguage: language || 'en-IN',
      };
    }

    return {
      transcript: 'How does physical activity help lower my post-meal blood sugar?',
      detectedLanguage: language || 'en-IN',
    };
  }

  async generateResponse(params: {
    prompt: string;
    transcript?: string;
    language?: string;
    patientContext?: PatientVoiceContext;
  }): Promise<{
    textResponse: string;
    spokenText: string;
    intent: string;
    emergencyNotice?: string;
    isMock: boolean;
  }> {
    const text = (params.prompt || params.transcript || '').trim();
    if (!text) {
      throw new DamuServiceError('A speech transcript or text prompt is required.', 400);
    }

    const lower = text.toLowerCase();

    // 1. Emergency Detection
    const emergencyNotice = evaluateEmergencyConditions(text, params.patientContext?.recentGlucose);

    // 2. Prohibited Intent
    const prohibited = evaluateProhibitedIntent(text);
    if (prohibited.isProhibited) {
      const refusal = `I understand your question, but as Damu, your diabetes companion, I cannot prescribe medications, change dosages, or diagnose conditions. Please speak directly with your treating doctor before altering your medication.`;
      return {
        textResponse: refusal,
        spokenText: refusal,
        intent: 'PROHIBITED_ACTION_REFUSAL',
        emergencyNotice,
        isMock: true,
      };
    }

    // 3. Domain Specific Knowledge Fallbacks
    if (emergencyNotice) {
      const isConsciousnessImpaired = detectImpairedConsciousnessOrSwallowing(text);
      const emergencyResponse = isConsciousnessImpaired
        ? 'URGENT SAFETY ALERT: Do not give anything by mouth to an unconscious or seizing individual due to aspiration risk. Call emergency services (112 or 108) immediately and place them in the recovery position. Use prescribed glucagon only if trained.'
        : 'Please pay close attention: your reported symptoms or readings require immediate medical attention. If awake and able to swallow safely, consume 15-20g of fast-acting glucose immediately and contact emergency services (112 or 108) if readings do not improve in 15 minutes.';
      return {
        textResponse: emergencyResponse,
        spokenText: emergencyResponse,
        intent: 'EMERGENCY_ESCALATION',
        emergencyNotice,
        isMock: true,
      };
    }

    if (lower.includes('hba1c') || lower.includes('a1c')) {
      const response = `HbA1c measures your average blood glucose over the past 2 to 3 months. For most adults with diabetes, a common target is below 7.0%, but your physician will personalize your goal based on your health profile.`;
      return {
        textResponse: response,
        spokenText: response,
        intent: 'DIABETES_EDUCATION',
        isMock: true,
      };
    }

    if (lower.includes('fasting') || lower.includes('glucose') || lower.includes('sugar')) {
      const response = `Fasting blood glucose is typically measured after at least 8 hours without food. Standard target ranges are often between 80 to 130 mg/dL, though your personal care plan defines your exact targets.`;
      return {
        textResponse: response,
        spokenText: response,
        intent: 'DIABETES_EDUCATION',
        isMock: true,
      };
    }

    if (
      lower.includes('diet') ||
      lower.includes('rice') ||
      lower.includes('roti') ||
      lower.includes('food') ||
      lower.includes('eat') ||
      lower.includes('dinner') ||
      lower.includes('lunch') ||
      lower.includes('meal') ||
      lower.includes('nutrition')
    ) {
      const response = `Balancing complex carbohydrates like whole wheat roti with fiber-rich vegetables, dal, and lean proteins helps maintain steady glycemic levels after meals.`;
      return {
        textResponse: response,
        spokenText: response,
        intent: 'LIFESTYLE_GUIDANCE',
        isMock: true,
      };
    }

    const defaultReply = `Namaste! I am Damu, your diabetes care companion. I can help explain your lab results, daily targets, and lifestyle habits. How can I support your care journey today?`;
    return {
      textResponse: defaultReply,
      spokenText: defaultReply,
      intent: 'INFORMATIONAL_QUERY',
      isMock: true,
    };
  }

  async synthesizeSpeech(params: {
    text: string;
    language?: string;
    speaker?: string;
  }): Promise<{
    audioBase64: string;
    format: string;
    provider: string;
    speaker: string;
  }> {
    const cleanText = sanitizeTextForTts(params.text);
    if (!cleanText) {
      throw new DamuServiceError('Text cannot be empty for voice synthesis.', 400);
    }
    const targetLang = params.language || 'en-IN';
    const speaker =
      params.speaker ||
      env.SARVAM_TTS_SPEAKER ||
      SARVAM_LANGUAGE_SPEAKERS[targetLang] ||
      SARVAM_TTS_DEFAULT_SPEAKER;
    const wavBuffer = createMockWavBuffer(22050, 100);
    return {
      audioBase64: wavBuffer.toString('base64'),
      format: 'audio/wav',
      provider: 'mock-sarvam-bulbul',
      speaker,
    };
  }

  async getProviderStatus(): Promise<DamuProviderStatus> {
    return {
      configuredProvider: 'Mock Damu Provider (Deterministic Testing)',
      isAvailable: true,
      models: {
        stt: 'mock-saarika-v2',
        llm: 'mock-llama-3.3-70b-versatile',
        tts: 'mock-bulbul-v4-flash',
      },
      ttsProvider: 'mock-sarvam-bulbul',
      supportedLanguages: SUPPORTED_LANGUAGES,
      audioRetentionPolicy: 'SESSION_ONLY_ZERO_RETENTION',
      clinicalDisclaimer: CLINICAL_DISCLAIMER,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Provider Registry & Factory                                             */
/* -------------------------------------------------------------------------- */
let injectedProvider: DamuVoiceProvider | undefined;

export function setDamuProviderForTests(provider?: DamuVoiceProvider): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test provider injection is only permitted in the test environment.');
  }
  injectedProvider = provider;
}

export function getDamuProvider(): DamuVoiceProvider {
  if (injectedProvider) {
    return injectedProvider;
  }

  // Prefer Sarvam AI for STT when SARVAM_API_KEY is configured —
  // Groq Llama 3.3 is used as the LLM backend regardless.
  if (env.SARVAM_API_KEY) {
    return new SarvamDamuProvider(env.SARVAM_API_KEY, env.GROQ_API_KEY);
  }

  if (!env.GROQ_API_KEY) {
    throw new DamuServiceError(
      'Damu provider is not configured. Configure SARVAM_API_KEY or GROQ_API_KEY before enabling AI responses.',
      503,
    );
  }

  return new GroqDamuProvider(env.GROQ_API_KEY);
}
