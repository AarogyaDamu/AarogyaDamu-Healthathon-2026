import { z } from 'zod';
import { env } from '../config/env';

export interface SpeakerSegment {
  speaker: 'Doctor' | 'Patient';
  text: string;
  timestamp?: string;
}

export interface StructuredClinicalNote {
  chiefComplaint: string;
  symptoms: string[];
  historyOfPresentIllness: string;
  relevantMedicalHistory: string[];
  currentMedications: Array<{ name: string; dose?: string; frequency?: string }>;
  allergies: string[];
  examinationFindings: string[];
  clinicalAssessment: string;
  investigationsOrdered: string[];
  treatmentPlan: string[];
  followUpInstructions: string;
  uncertainOrMissingInformation: string[];
}

export interface PatientBaselineContext {
  fullName?: string | null;
  diabetesType?: string | null;
  allergies?: string | null;
}

export interface ScribeProvider {
  readonly name: string;
  transcribeAndDiarize(audioBase64: string, mimeType: string): Promise<{
    transcript: string;
    segments: SpeakerSegment[];
  }>;
  generateClinicalNote(
    transcript: string,
    segments: SpeakerSegment[],
    baseline?: PatientBaselineContext,
  ): Promise<StructuredClinicalNote>;
}

export const speakerSegmentSchema = z.object({
  speaker: z.enum(['Doctor', 'Patient']),
  text: z.string().min(1).max(10_000),
  timestamp: z.string().max(32).optional(),
}).strict();

const transcriptionSchema = z.object({
  transcript: z.string().min(1).max(500_000),
  segments: z.array(speakerSegmentSchema).min(1).max(5_000),
}).strict();

export const structuredClinicalNoteSchema = z.object({
  chiefComplaint: z.string().max(10_000),
  symptoms: z.array(z.string().max(2_000)).max(100),
  historyOfPresentIllness: z.string().max(20_000),
  relevantMedicalHistory: z.array(z.string().max(2_000)).max(100),
  currentMedications: z.array(z.object({
    name: z.string().min(1).max(500),
    dose: z.string().max(500).optional(),
    frequency: z.string().max(500).optional(),
  }).strict()).max(100),
  allergies: z.array(z.string().max(2_000)).max(100),
  examinationFindings: z.array(z.string().max(2_000)).max(100),
  clinicalAssessment: z.string().max(20_000),
  investigationsOrdered: z.array(z.string().max(2_000)).max(100),
  treatmentPlan: z.array(z.string().max(2_000)).max(100),
  followUpInstructions: z.string().max(10_000),
  uncertainOrMissingInformation: z.array(z.string().max(2_000)).max(100),
}).strict();

export class ScribeServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502 | 503,
  ) {
    super(message);
    this.name = 'ScribeServiceError';
  }
}

const CLINICAL_NOTE_SYSTEM_PROMPT = `You are a clinical documentation assistant. Convert only information explicitly stated in the consultation into the requested JSON clinical note. Do not infer or invent diagnoses, vital signs, medication details, examination findings, or treatment. Use empty arrays or "Not discussed" where appropriate. Put ambiguity and missing information in uncertainOrMissingInformation. Output only valid JSON.`;

class GeminiScribeProvider implements ScribeProvider {
  readonly name = 'gemini-2.5-flash';

  constructor(private readonly apiKey: string) {}

  private async generate(parts: unknown[]): Promise<string> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        },
      );
    } catch {
      throw new ScribeServiceError('The transcription provider could not be reached. Retry the draft.', 502);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ScribeServiceError('The transcription provider could not process this request. Retry the draft.', 502);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new ScribeServiceError('The transcription provider returned an invalid response.', 502);
    }

    const responseSchema = z.object({
      candidates: z.array(z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string() }).passthrough()),
        }).passthrough(),
      }).passthrough()).min(1),
    }).passthrough();
    const parsed = responseSchema.safeParse(payload);
    const text = parsed.success
      ? parsed.data.candidates[0]?.content.parts.find((part) => part.text.trim())?.text
      : undefined;

    if (!text) {
      throw new ScribeServiceError('The transcription provider returned an empty response.', 502);
    }
    return text;
  }

  async transcribeAndDiarize(audioBase64: string, mimeType: string): Promise<{
    transcript: string;
    segments: SpeakerSegment[];
  }> {
    const responseText = await this.generate([
      {
        text: `Transcribe this clinical conversation verbatim. Identify speakers as Doctor or Patient only when supported by the audio; use the closest supported label and do not invent speech. Include timestamps when available. Return JSON matching exactly:
{"transcript":"...","segments":[{"speaker":"Doctor","text":"...","timestamp":"00:00"}]}`,
      },
      { inlineData: { mimeType, data: audioBase64 } },
    ]);

    let output: unknown;
    try {
      output = JSON.parse(responseText);
    } catch {
      throw new ScribeServiceError('The transcription provider returned malformed transcript data.', 502);
    }

    const parsed = transcriptionSchema.safeParse(output);
    if (!parsed.success) {
      throw new ScribeServiceError('The transcription provider returned an unsupported transcript format.', 502);
    }
    return parsed.data;
  }

  async generateClinicalNote(
    transcript: string,
    segments: SpeakerSegment[],
    baseline?: PatientBaselineContext,
  ): Promise<StructuredClinicalNote> {
    const responseText = await this.generate([{
      text: `${CLINICAL_NOTE_SYSTEM_PROMPT}

Patient context on record (do not treat as consultation statements):
${JSON.stringify({
        diabetesType: baseline?.diabetesType ?? null,
        allergies: baseline?.allergies ?? null,
      })}

Consultation transcript:
${segments.map((segment) => `[${segment.speaker}] ${segment.text}`).join('\n') || transcript}

Return JSON with this exact schema:
{"chiefComplaint":"...","symptoms":[],"historyOfPresentIllness":"...","relevantMedicalHistory":[],"currentMedications":[{"name":"...","dose":"...","frequency":"..."}],"allergies":[],"examinationFindings":[],"clinicalAssessment":"...","investigationsOrdered":[],"treatmentPlan":[],"followUpInstructions":"...","uncertainOrMissingInformation":[]}`,
    }]);

    let output: unknown;
    try {
      output = JSON.parse(responseText);
    } catch {
      throw new ScribeServiceError('The note provider returned malformed clinical-note data.', 502);
    }

    const parsed = structuredClinicalNoteSchema.safeParse(output);
    if (!parsed.success) {
      throw new ScribeServiceError('The note provider returned an unsupported clinical-note format.', 502);
    }
    return parsed.data;
  }
}

let testProvider: ScribeProvider | undefined;

export function setScribeProviderForTests(provider?: ScribeProvider): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test provider injection is only available in the test environment.');
  }
  testProvider = provider;
}

function getProvider(): ScribeProvider {
  const provider = testProvider ?? (env.GEMINI_API_KEY ? new GeminiScribeProvider(env.GEMINI_API_KEY) : undefined);
  if (!provider) {
    throw new ScribeServiceError('Clinical transcription is not configured on this server.', 503);
  }
  return provider;
}

export class GeminiScribeService {
  static getConfiguredProviderName(): string {
    return getProvider().name;
  }

  static async transcribeAndDiarize(
    audioBase64: string,
    mimeType: string,
    testTranscript?: string,
  ): Promise<{ transcript: string; segments: SpeakerSegment[] }> {
    if (testTranscript !== undefined && process.env.NODE_ENV === 'test') {
      return this.parseTextTranscript(testTranscript);
    }
    return getProvider().transcribeAndDiarize(audioBase64, mimeType);
  }

  static parseTextTranscript(rawText: string): { transcript: string; segments: SpeakerSegment[] } {
    const segments: SpeakerSegment[] = [];
    for (const line of rawText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      const match = line.match(/^(?:Doctor|Dr\.?|Clinician|Patient|Pt\.?)\s*:\s*(.+)$/i);
      if (!match) {
        throw new ScribeServiceError('Test transcripts must label each utterance as Doctor or Patient.', 400);
      }
      const speaker = /^(?:Patient|Pt\.?)/i.test(line) ? 'Patient' : 'Doctor';
      segments.push({ speaker, text: match[1].trim() });
    }
    if (!segments.length) {
      throw new ScribeServiceError('Transcript is empty.', 400);
    }
    return { transcript: rawText.trim(), segments };
  }

  static generateClinicalNote(
    transcript: string,
    segments: SpeakerSegment[],
    patientBaseline?: PatientBaselineContext,
  ): Promise<StructuredClinicalNote> {
    return getProvider().generateClinicalNote(transcript, segments, patientBaseline);
  }

  static formatApprovedClinicalSummary(note: StructuredClinicalNote, clinicianName: string): string {
    const plan = note.treatmentPlan.join('; ');
    return `Clinician: ${clinicianName} | Assessment: ${note.clinicalAssessment || 'Not documented'} | Chief complaint: ${note.chiefComplaint || 'Not documented'} | Plan: ${plan || 'Not documented'} | Follow-up: ${note.followUpInstructions || 'Not documented'}`;
  }
}
