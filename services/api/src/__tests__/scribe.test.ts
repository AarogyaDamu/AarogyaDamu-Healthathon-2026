
import request from 'supertest';
import { randomUUID } from 'crypto';

/**
 * Mock external AI operations while retaining the actual schemas
 * and error classes from the production scribe service.
 */
jest.mock('../services/scribeService', () => {
  const actual = jest.requireActual('../services/scribeService');

  return {
    ...actual,
    GeminiScribeService: {
      transcribeAndDiarize: jest.fn(),
      generateClinicalNote: jest.fn(),
      getConfiguredProviderName: jest.fn(),
      formatApprovedClinicalSummary: jest.fn(),
    },
  };
});

import { app, prisma } from '../server';
import { GeminiScribeService } from '../services/scribeService';

const DOCTOR_EMAIL = 'dr.kulkarni@aarogyadamu.local';
const PATIENT_EMAIL = 'scribe.patient@aarogyadamu.local';
const TEST_PASSWORD = 'Password123!';

const mockTranscript = [
  'Doctor: How have your blood sugars been lately?',
  'Patient: My fasting blood sugar has been around 150, and I sometimes feel dizzy.',
  'Doctor: We discussed your current medication and repeating the HbA1c test.',
].join('\n');

const mockSegments = [
  {
    speaker: 'Doctor',
    text: 'How have your blood sugars been lately?',
    timestamp: '00:00:01',
  },
  {
    speaker: 'Patient',
    text: 'My fasting blood sugar has been around 150, and I sometimes feel dizzy.',
    timestamp: '00:00:05',
  },
  {
    speaker: 'Doctor',
    text: 'We discussed your current medication and repeating the HbA1c test.',
    timestamp: '00:00:12',
  },
];

/**
 * Must match the actual structuredClinicalNoteSchema.
 *
 * currentMedications is intentionally empty because the test has not
 * confirmed the medication details in the transcript. This prevents
 * unverified medication information from being represented as a fact.
 */
const mockStructuredNote = {
  chiefComplaint:
    'Follow-up regarding blood glucose and occasional dizziness.',

  relevantMedicalHistory: [
    'Patient profile lists type 2 diabetes mellitus.',
  ],

  symptoms: [
    'Occasional dizziness, as reported by the patient.',
  ],

  historyOfPresentIllness:
    'The patient reports fasting blood glucose readings around 150 mg/dL.',

  currentMedications: [],

  allergies: [],

  examinationFindings: [],

  investigationsOrdered: [],

  clinicalAssessment:
    'Reported blood glucose readings and dizziness require clinician review.',

  treatmentPlan: [
    'Review the reported symptoms and available glucose readings.',
    'Confirm medication changes and required investigations with the treating clinician.',
  ],

  followUpInstructions:
    'Confirm follow-up timing and investigation requirements with the treating clinician.',

  uncertainOrMissingInformation: [
    'Dates and records for the reported glucose readings.',
    'Onset, duration, and severity of dizziness.',
    'Current medication details have not been confirmed.',
    'Whether HbA1c testing has been formally ordered.',
  ],
};

const scribeMocks = GeminiScribeService as unknown as {
  transcribeAndDiarize: jest.Mock;
  generateClinicalNote: jest.Mock;
  getConfiguredProviderName: jest.Mock;
  formatApprovedClinicalSummary: jest.Mock;
};

describe('AarogyaDamu secure medical scribe workflow', () => {
  let doctorToken: string;
  let doctorId: string;
  let patientToken: string;
  let patientId: string;
  let consultationId: string;

  /**
   * Prepare dedicated test users and records.
   * Do not delete unrelated users or consultation notes.
   */
  beforeAll(async () => {
    const previousUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [DOCTOR_EMAIL, PATIENT_EMAIL],
        },
      },
      select: {
        id: true,
      },
    });

    const previousIds = previousUsers.map((user) => user.id);

    if (previousIds.length > 0) {
      await prisma.consultationNote.deleteMany({
        where: {
          OR: [
            { userId: { in: previousIds } },
            { clinicianId: { in: previousIds } },
          ],
        },
      });
    }

    if (previousIds.length > 0) {
      await prisma.appointment.deleteMany({
        where: {
          OR: [
            { patientId: { in: previousIds } },
            { doctorId: { in: previousIds } },
            { bookedById: { in: previousIds } },
          ],
        },
      });

      await prisma.doctorPatientAssignment.deleteMany({
        where: {
          OR: [
            { patientId: { in: previousIds } },
            { doctorId: { in: previousIds } },
          ],
        },
      });
    }

    await prisma.caregiverConsent.deleteMany({
      where: {
        OR: [
          { caregiverEmail: DOCTOR_EMAIL },
          ...(previousIds.length > 0
            ? [{ patientId: { in: previousIds } }]
            : []),
        ],
      },
    });

    if (previousIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: previousIds,
          },
        },
      });
    }

    // Register the clinician.
    const doctorResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: DOCTOR_EMAIL,
        password: TEST_PASSWORD,
        fullName: 'Dr. Anjali Kulkarni',
      });

    if (
      !doctorResponse.body?.token ||
      !doctorResponse.body?.user?.id
    ) {
      throw new Error(
        `Test clinician registration failed: ${JSON.stringify(
          doctorResponse.body,
        )}`,
      );
    }

    doctorToken = doctorResponse.body.token;
    doctorId = doctorResponse.body.user.id;

    // Registration does not automatically grant clinician privileges.
    await prisma.user.update({
      where: { id: doctorId },
      data: { isClinician: true },
    });

    // Register the patient.
    const patientResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: PATIENT_EMAIL,
        password: TEST_PASSWORD,
        fullName: 'Ramesh Deshmukh',
      });

    if (
      !patientResponse.body?.token ||
      !patientResponse.body?.user?.id
    ) {
      throw new Error(
        `Test patient registration failed: ${JSON.stringify(
          patientResponse.body,
        )}`,
      );
    }

    patientToken = patientResponse.body.token;
    patientId = patientResponse.body.user.id;

    // Create or update the patient's clinical profile.
    await prisma.patientProfile.upsert({
      where: {
        userId: patientId,
      },
      create: {
        userId: patientId,
        fullName: 'Ramesh Deshmukh',
        diabetesType: 'TYPE_2_DIABETES',
        knownAllergies: 'None documented',
      },
      update: {
        fullName: 'Ramesh Deshmukh',
        diabetesType: 'TYPE_2_DIABETES',
        knownAllergies: 'None documented',
      },
    });

    // Create the consultation required by the secure scribe endpoint.
    const consultation = await prisma.consultationPrep.create({
      data: {
        userId: patientId,
        concernsAndQuestions:
          'Review recent blood glucose readings and discuss reported dizziness.',
        scheduledAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    consultationId = consultation.id;

    // Explicit patient authorization for clinician consultation access.
    await prisma.caregiverConsent.create({
      data: {
        patientId,
        caregiverEmail: DOCTOR_EMAIL,
        caregiverName: 'Dr. Anjali Kulkarni',
        relationship: 'CAREGIVER',
        status: 'ACTIVE',
        permissions: JSON.stringify([
          'MANAGE_CONSULTATIONS',
          'VIEW_CONSULTATIONS',
          'VIEW_OBSERVATIONS',
        ]),
      },
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    scribeMocks.transcribeAndDiarize.mockResolvedValue({
      transcript: mockTranscript,
      segments: mockSegments,
    });

    scribeMocks.generateClinicalNote.mockResolvedValue(
      mockStructuredNote,
    );

    scribeMocks.getConfiguredProviderName.mockReturnValue(
      'mock-gemini',
    );

    scribeMocks.formatApprovedClinicalSummary.mockReturnValue(
      'Clinician-reviewed consultation summary.',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function clinicianRequest() {
    return {
      authorization: `Bearer ${doctorToken}`,
      targetPatientId: patientId,
    };
  }

  /**
   * Create a new recording session with consent and delegated access.
   */
  async function createRecordingSession(
    label: string,
  ): Promise<string> {
    const headers = clinicianRequest();

    const response = await request(app)
      .post('/api/scribe/sessions')
      .set('Authorization', headers.authorization)
      .set('X-Target-Patient-Id', headers.targetPatientId)
      .send({
        patientId,
        consultationId,
        consentObtained: true,
        consentVersion: 'test-consent-v1',
        idempotencyKey: `scribe-test-${label}-${randomUUID()}`,
      });

    if (response.status !== 201 && response.status !== 200) {
      throw new Error(
        'Could not create scribe session. ' +
          `HTTP ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }

    expect(response.body.session).toBeDefined();
    expect(response.body.session.id).toBeDefined();

    return response.body.session.id as string;
  }

  /**
   * Process a session using deterministic mock audio.
   * The production route, access checks and database operations remain real.
   */
  async function processRecordingSession(
    sessionId: string,
  ): Promise<any> {
    const headers = clinicianRequest();

    const response = await request(app)
      .post(`/api/scribe/sessions/${sessionId}/process`)
      .set('Authorization', headers.authorization)
      .set('X-Target-Patient-Id', headers.targetPatientId)
      .send({
        audioBase64: Buffer.from(
          'deterministic mock audio',
        ).toString('base64'),
        mimeType: 'audio/webm',
        durationSeconds: 5,
      });

    if (response.status !== 200) {
      throw new Error(
        `Scribe processing failed. HTTP ${response.status}: ` +
          `${JSON.stringify(response.body)}. ` +
          `Transcription mock calls: ` +
          `${scribeMocks.transcribeAndDiarize.mock.calls.length}; ` +
          `clinical-note mock calls: ` +
          `${scribeMocks.generateClinicalNote.mock.calls.length}.`,
      );
    }

    expect(response.body.session).toBeDefined();
    expect(response.body.session.id).toBe(sessionId);
    expect(response.body.session.status).toBe('PENDING_REVIEW');
    expect(response.body.session.recordingStatus).toBe('COMPLETED');

    return response.body.session;
  }

  async function createProcessedSession(
    label: string,
  ): Promise<{ id: string; session: any }> {
    const id = await createRecordingSession(label);
    const session = await processRecordingSession(id);

    return { id, session };
  }

  /**
   * Approve the note using the real production approval endpoint.
   */
  async function approveSession(
    sessionId: string,
    summaryText =
      'Doctor: Dr. Kulkarni | ' +
      'Assessment: Review of reported blood glucose readings and dizziness | ' +
      'Plan: Clinician to review symptoms and follow-up testing.',
  ) {
    const headers = clinicianRequest();

    const response = await request(app)
      .post(`/api/scribe/${sessionId}/approve`)
      .set('Authorization', headers.authorization)
      .set('X-Target-Patient-Id', headers.targetPatientId)
      .send({
        approvedSummaryText: summaryText,
      });

    if (response.status !== 200) {
      console.error(
        '[SCRIBE APPROVAL FAILURE]',
        JSON.stringify(
          {
            status: response.status,
            responseBody: response.body,
          },
          null,
          2,
        ),
      );
    }

    return response;
  }

  test('CONSENT: rejects session creation when consent is false', async () => {
    const headers = clinicianRequest();

    const response = await request(app)
      .post('/api/scribe/sessions')
      .set('Authorization', headers.authorization)
      .set('X-Target-Patient-Id', headers.targetPatientId)
      .send({
        patientId,
        consultationId,
        consentObtained: false,
        consentVersion: 'test-consent-v1',
        idempotencyKey: `scribe-test-no-consent-${randomUUID()}`,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(
      scribeMocks.transcribeAndDiarize,
    ).not.toHaveBeenCalled();
  });

  test('TRANSCRIPTION: separates doctor and patient dialogue into turns', async () => {
    const { session } = await createProcessedSession('transcription');

    expect(session.transcript).toBe(mockTranscript);
    expect(Array.isArray(session.segments)).toBe(true);
    expect(session.segments).toHaveLength(3);
    expect(session.segments[0].speaker).toBe('Doctor');
    expect(session.segments[1].speaker).toBe('Patient');
    expect(session.segments[2].speaker).toBe('Doctor');

    expect(
      scribeMocks.transcribeAndDiarize,
    ).toHaveBeenCalledTimes(1);

    expect(
      scribeMocks.generateClinicalNote,
    ).toHaveBeenCalledTimes(1);
  });

  test('CLINICAL STRUCTURE: saves all required note categories', async () => {
    const { id } = await createProcessedSession('clinical-structure');

    const note = await prisma.consultationNote.findUnique({
      where: { id },
    });

    expect(note).not.toBeNull();
    expect(note!.status).toBe('PENDING_REVIEW');

    const structuredNote = JSON.parse(note!.structuredNote);

    expect(structuredNote.chiefComplaint).toBeDefined();
    expect(Array.isArray(structuredNote.relevantMedicalHistory)).toBe(true);
    expect(Array.isArray(structuredNote.symptoms)).toBe(true);
    expect(structuredNote.historyOfPresentIllness).toBeDefined();
    expect(Array.isArray(structuredNote.currentMedications)).toBe(true);
    expect(Array.isArray(structuredNote.allergies)).toBe(true);
    expect(Array.isArray(structuredNote.examinationFindings)).toBe(true);
    expect(Array.isArray(structuredNote.investigationsOrdered)).toBe(true);
    expect(structuredNote.clinicalAssessment).toBeDefined();
    expect(Array.isArray(structuredNote.treatmentPlan)).toBe(true);
    expect(typeof structuredNote.followUpInstructions).toBe('string');
    expect(
      Array.isArray(structuredNote.uncertainOrMissingInformation),
    ).toBe(true);
  });

  test('TIMELINE ISOLATION: pending notes do not enter the patient timeline', async () => {
    const { id } = await createProcessedSession('timeline-isolation');

    const response = await request(app)
      .get('/api/timeline')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.events)).toBe(true);

    const pendingNoteEvent = response.body.events.find(
      (event: any) => event.id === `scribe-${id}`,
    );

    expect(pendingNoteEvent).toBeUndefined();

    const storedNote = await prisma.consultationNote.findUnique({
      where: { id },
    });

    expect(storedNote?.status).toBe('PENDING_REVIEW');
  });

  test('APPROVAL: the original clinician approves a pending note and records an audit event', async () => {
    const { id } = await createProcessedSession('approval');

    const response = await approveSession(
      id,
      'Doctor: Dr. Kulkarni | Assessment: Review required | ' +
        'Plan: Review reported glucose readings and symptoms.',
    );

    expect(response.status).toBe(200);
    expect(response.body.approvedNote).toBeDefined();
    expect(response.body.approvedNote.id).toBe(id);
    expect(response.body.approvedNote.status).toBe('APPROVED');
    expect(response.body.approvedNote.approvedAt).toBeDefined();
    expect(response.body.approvedNote.approvedBy).toBe(doctorId);

    const storedNote = await prisma.consultationNote.findUnique({
      where: { id },
    });

    expect(storedNote?.status).toBe('APPROVED');
    expect(storedNote?.approvedBy).toBe(doctorId);

    const auditEvent = await prisma.auditLog.findFirst({
      where: {
        userId: patientId,
        actorId: doctorId,
        action: 'CONSULTATION_SCRIBE_APPROVED',
        entityType: 'ConsultationNote',
        entityId: id,
      },
    });

    expect(auditEvent).not.toBeNull();
  });

  test('TIMELINE: an approved note appears in the patient timeline', async () => {
    const { id } = await createProcessedSession('timeline-approved');

    const summary =
      'Doctor: Dr. Kulkarni | Plan: Review glucose readings and follow up.';

    const approvalResponse = await approveSession(id, summary);

    expect(approvalResponse.status).toBe(200);

    const timelineResponse = await request(app)
      .get('/api/timeline')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(timelineResponse.status).toBe(200);

    const event = timelineResponse.body.events.find(
      (entry: any) => entry.id === `scribe-${id}`,
    );

    expect(event).toBeDefined();
    expect(event.eventType).toBe('CONSULTATION_NOTE');
    expect(event.title).toContain('Doctor Consultation Note');
    expect(event.details).toContain('Review glucose readings');
  });

  test('REJECTION: rejected notes remain rejected and are excluded from the timeline', async () => {
    const { id } = await createProcessedSession('rejection');

    const headers = clinicianRequest();

    const rejectionResponse = await request(app)
      .post(`/api/scribe/${id}/reject`)
      .set('Authorization', headers.authorization)
      .set('X-Target-Patient-Id', headers.targetPatientId)
      .send({
        reason: 'Test rejection: clinician review identified an issue.',
      });

    expect(rejectionResponse.status).toBe(200);
    expect(rejectionResponse.body.status).toBe('REJECTED');

    const storedNote = await prisma.consultationNote.findUnique({
      where: { id },
    });

    expect(storedNote?.status).toBe('REJECTED');
    expect(storedNote?.rejectionReason).toContain('Test rejection');

    const timelineResponse = await request(app)
      .get('/api/timeline')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(timelineResponse.status).toBe(200);

    const rejectedNoteEvent = timelineResponse.body.events.find(
      (entry: any) => entry.id === `scribe-${id}`,
    );

    expect(rejectedNoteEvent).toBeUndefined();
  });

  test('AUTHORIZATION: a patient account cannot start a clinician scribe session', async () => {
    const response = await request(app)
      .post('/api/scribe/sessions')
      .set('Authorization', `Bearer ${patientToken}`)
      .set('X-Target-Patient-Id', patientId)
      .send({
        patientId,
        consultationId,
        consentObtained: true,
        consentVersion: 'test-consent-v1',
        idempotencyKey: `scribe-test-patient-access-${randomUUID()}`,
      });

    expect(response.status).toBe(403);
  });
});
