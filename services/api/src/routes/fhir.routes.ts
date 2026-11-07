/**
 * HL7 FHIR R4 RESTful API Routes
 * Conformance: HL7 FHIR R4 (v4.0.1)
 * Standard: https://hl7.org/fhir/R4/http.html
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { resolvePatientContext, RequiredPermission } from '../permissions/evaluator';
import {
  mapToFhirPatient,
  mapToFhirPractitioner,
  mapToFhirRelatedPerson,
  mapToFhirObservation,
  mapToFhirCondition,
  mapToFhirCarePlan,
  mapToFhirGoal,
  mapToFhirTask,
  mapToFhirMedicationRequest,
  mapToFhirMedicationStatement,
  mapToFhirEncounter,
  mapToFhirDiagnosticReport,
  mapToFhirDocumentReference,
  mapToFhirConsent,
  mapToFhirCommunication,
  mapToFhirAuditEvent,
} from '../fhir/mapper';
import { validateFhirResource, createOperationOutcome } from '../fhir/validator';
import { createSearchsetBundle, createPatientRecordBundle } from '../fhir/bundle';
import { FhirResourceBase } from '../fhir/types';

export const fhirRouter = Router();

// Middleware to set FHIR Content-Type header
fhirRouter.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/fhir+json; charset=utf-8');
  next();
});

// Helper for FHIR error responses
function sendFhirError(res: Response, status: number, code: string, diagnostics: string) {
  const outcome = createOperationOutcome([
    {
      severity: status >= 500 ? 'fatal' : 'error',
      code,
      diagnostics,
    },
  ]);
  return res.status(status).json(outcome);
}

// Helper to resolve patient context with explicit target patient ID
async function checkPatientAccess(req: Request, targetPatientId: string, permission: RequiredPermission) {
  req.headers['x-target-patient-id'] = targetPatientId;
  return resolvePatientContext(req, permission);
}

/**
 * 1. CapabilityStatement (Conformance Metadata)
 * GET /api/fhir/r4/metadata
 */
fhirRouter.get('/metadata', (_req: Request, res: Response) => {
  return res.json({
    resourceType: 'CapabilityStatement',
    id: 'aarogyadamu-fhir-r4',
    version: '1.0.0',
    name: 'AarogyaDamuCapabilityStatement',
    title: 'AarogyaDamu Diabetes Care Companion FHIR R4 Server',
    status: 'active',
    date: '2026-11-07',
    publisher: 'AarogyaDamu Health-a-thon Initiative',
    kind: 'instance',
    software: {
      name: 'AarogyaDamu Health Interoperability Engine',
      version: '1.0.0',
    },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/json'],
    rest: [
      {
        mode: 'server',
        documentation: 'RESTful HL7 FHIR R4 interface for diabetes care management, glycemic tracking, and care coordination.',
        security: {
          cors: true,
          service: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/restful-security-service',
                  code: 'SMART-on-FHIR',
                  display: 'SMART-on-FHIR / OAuth2 Bearer Token',
                },
              ],
            },
          ],
        },
        resource: [
          { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Practitioner', interaction: [{ code: 'read' }] },
          { type: 'RelatedPerson', interaction: [{ code: 'read' }] },
          { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'CarePlan', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Goal', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Task', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'MedicationRequest', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'MedicationStatement', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'DiagnosticReport', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'DocumentReference', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Consent', interaction: [{ code: 'read' }, { code: 'search-type' }] },
          { type: 'Communication', interaction: [{ code: 'read' }] },
          { type: 'AuditEvent', interaction: [{ code: 'read' }, { code: 'search-type' }] },
        ],
      },
    ],
  });
});

/**
 * 2. Patient Resource
 * GET /api/fhir/r4/Patient
 * GET /api/fhir/r4/Patient/:id
 * GET /api/fhir/r4/Patient/:id/$everything
 */
fhirRouter.get('/Patient', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isClinician = req.user?.isClinician;
    let users: any[] = [];

    if (isClinician) {
      // Clinician sees assigned active patients
      const assignments = await prisma.doctorPatientAssignment.findMany({
        where: { doctorId: req.user!.id, status: 'ACTIVE' },
        include: { patient: { include: { profile: true } } },
      });
      users = assignments.map((a) => a.patient).filter(Boolean);
    } else {
      // Patient sees self
      const selfUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { profile: true },
      });
      if (selfUser) users = [selfUser];
    }

    const resources = users.map((u) => mapToFhirPatient(u));
    return res.json(createSearchsetBundle(resources, 'Patient'));
  } catch (err: any) {
    return sendFhirError(res, 500, 'transient', err.message);
  }
});

fhirRouter.get('/Patient/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientId = req.params.id;
    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const user = await prisma.user.findUnique({
      where: { id: patientId },
      include: { profile: true },
    });

    if (!user) {
      return sendFhirError(res, 404, 'not-found', `Patient with ID ${patientId} not found.`);
    }

    const patientResource = mapToFhirPatient(user);
    const validation = validateFhirResource(patientResource);
    if (!validation.valid) {
      return res.status(422).json(validation.outcome);
    }

    return res.json(patientResource);
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * Patient $everything Operation Bundle
 * GET /api/fhir/r4/Patient/:id/$everything
 */
fhirRouter.get('/Patient/:id/\\$everything', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientId = req.params.id;
    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const user = await prisma.user.findUnique({
      where: { id: patientId },
      include: {
        profile: true,
        observations: { take: 100, orderBy: { observedAt: 'desc' } },
        tasks: { take: 50, orderBy: { createdAt: 'desc' } },
        documents: { take: 20, orderBy: { createdAt: 'desc' } },
        medicationSchedules: { take: 20 },
        medicationAdherenceEvents: { take: 50, orderBy: { createdAt: 'desc' } },
        consentsGiven: { take: 10 },
        appointmentsAsPatient: { take: 20, orderBy: { scheduledAt: 'desc' } },
        carePlansAsPatient: {
          include: { goals: true, activities: true },
          take: 5,
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!user) {
      return sendFhirError(res, 404, 'not-found', `Patient ${patientId} not found.`);
    }

    const bundleEntries: FhirResourceBase[] = [];

    // 1. Patient
    bundleEntries.push(mapToFhirPatient(user));

    // 2. Condition
    bundleEntries.push(mapToFhirCondition(patientId, user.profile));

    // 3. Observations
    (user.observations || []).forEach((obs) => {
      bundleEntries.push(mapToFhirObservation(obs));
    });

    // 4. CarePlans & Goals
    (user.carePlansAsPatient || []).forEach((cp) => {
      bundleEntries.push(mapToFhirCarePlan(cp));
      (cp.goals || []).forEach((g) => {
        bundleEntries.push(mapToFhirGoal(g, patientId));
      });
    });

    // 5. Tasks
    (user.tasks || []).forEach((t) => {
      bundleEntries.push(mapToFhirTask(t));
    });

    // 6. MedicationRequests & MedicationStatements
    (user.medicationSchedules || []).forEach((med) => {
      bundleEntries.push(mapToFhirMedicationRequest(med));
    });
    (user.medicationAdherenceEvents || []).forEach((evt) => {
      bundleEntries.push(mapToFhirMedicationStatement(evt, patientId));
    });

    // 7. Encounters
    (user.appointmentsAsPatient || []).forEach((appt) => {
      bundleEntries.push(mapToFhirEncounter(appt));
    });

    // 8. DiagnosticReports & Documents
    (user.documents || []).forEach((doc) => {
      bundleEntries.push(mapToFhirDiagnosticReport(doc));
      bundleEntries.push(mapToFhirDocumentReference(doc));
    });

    // 9. Consents
    (user.consentsGiven || []).forEach((c) => {
      bundleEntries.push(mapToFhirConsent(c));
    });

    const bundle = createPatientRecordBundle(patientId, bundleEntries);
    return res.json(bundle);
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 3. Practitioner Resource
 * GET /api/fhir/r4/Practitioner/:id
 */
fhirRouter.get('/Practitioner/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id, isClinician: true },
      include: { profile: true },
    });

    if (!user) {
      return sendFhirError(res, 404, 'not-found', `Practitioner with ID ${req.params.id} not found.`);
    }

    const practitioner = mapToFhirPractitioner(user);
    return res.json(practitioner);
  } catch (err: any) {
    return sendFhirError(res, 500, 'transient', err.message);
  }
});

/**
 * 4. Observation Resource
 * GET /api/fhir/r4/Observation
 * GET /api/fhir/r4/Observation/:id
 */
fhirRouter.get('/Observation', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const observations = await prisma.healthObservation.findMany({
      where: { userId: patientId },
      orderBy: { observedAt: 'desc' },
      take: 100,
    });

    const fhirObservations = observations.map(mapToFhirObservation);
    return res.json(createSearchsetBundle(fhirObservations, 'Observation'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

fhirRouter.get('/Observation/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const obs = await prisma.healthObservation.findUnique({
      where: { id: req.params.id },
    });

    if (!obs) {
      return sendFhirError(res, 404, 'not-found', `Observation ${req.params.id} not found.`);
    }

    await checkPatientAccess(req, obs.userId, 'VIEW_OBSERVATIONS');
    const fhirObs = mapToFhirObservation(obs);
    return res.json(fhirObs);
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 5. Condition Resource
 * GET /api/fhir/r4/Condition
 */
fhirRouter.get('/Condition', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const profile = await prisma.patientProfile.findUnique({
      where: { userId: patientId },
    });

    const condition = mapToFhirCondition(patientId, profile);
    return res.json(createSearchsetBundle([condition], 'Condition'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 6. CarePlan Resource
 * GET /api/fhir/r4/CarePlan
 */
fhirRouter.get('/CarePlan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_CARE_PLAN');

    const carePlans = await prisma.carePlan.findMany({
      where: { patientId },
      include: { goals: true, activities: true },
      orderBy: { version: 'desc' },
    });

    const fhirCarePlans = carePlans.map(mapToFhirCarePlan);
    return res.json(createSearchsetBundle(fhirCarePlans, 'CarePlan'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 7. Goal Resource
 * GET /api/fhir/r4/Goal
 */
fhirRouter.get('/Goal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_CARE_PLAN');

    const carePlans = await prisma.carePlan.findMany({
      where: { patientId },
      include: { goals: true },
    });

    const goals = carePlans.flatMap((cp) => cp.goals.map((g) => mapToFhirGoal(g, patientId)));
    return res.json(createSearchsetBundle(goals, 'Goal'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 8. Task Resource
 * GET /api/fhir/r4/Task
 */
fhirRouter.get('/Task', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.for || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'MANAGE_TASKS');

    const tasks = await prisma.careTask.findMany({
      where: { userId: patientId },
      orderBy: { createdAt: 'desc' },
    });

    const fhirTasks = tasks.map(mapToFhirTask);
    return res.json(createSearchsetBundle(fhirTasks, 'Task'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 9. MedicationRequest & MedicationStatement
 * GET /api/fhir/r4/MedicationRequest
 * GET /api/fhir/r4/MedicationStatement
 */
fhirRouter.get('/MedicationRequest', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const meds = await prisma.medicationSchedule.findMany({
      where: { userId: patientId },
    });

    const fhirMeds = meds.map(mapToFhirMedicationRequest);
    return res.json(createSearchsetBundle(fhirMeds, 'MedicationRequest'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

fhirRouter.get('/MedicationStatement', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const events = await prisma.medicationAdherenceEvent.findMany({
      where: { userId: patientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const statements = events.map((e) => mapToFhirMedicationStatement(e, patientId));
    return res.json(createSearchsetBundle(statements, 'MedicationStatement'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 10. Encounter Resource
 * GET /api/fhir/r4/Encounter
 */
fhirRouter.get('/Encounter', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const appointments = await prisma.appointment.findMany({
      where: { patientId },
      orderBy: { scheduledAt: 'desc' },
    });

    const encounters = appointments.map(mapToFhirEncounter);
    return res.json(createSearchsetBundle(encounters, 'Encounter'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 11. DiagnosticReport Resource
 * GET /api/fhir/r4/DiagnosticReport
 */
fhirRouter.get('/DiagnosticReport', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.subject || req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_DOCUMENTS');

    const documents = await prisma.healthDocument.findMany({
      where: { userId: patientId, category: 'LAB_REPORT' },
      orderBy: { createdAt: 'desc' },
    });

    const reports = documents.map(mapToFhirDiagnosticReport);
    return res.json(createSearchsetBundle(reports, 'DiagnosticReport'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 12. Consent Resource
 * GET /api/fhir/r4/Consent
 */
fhirRouter.get('/Consent', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patientQuery = req.query.patient;
    const patientId = typeof patientQuery === 'string'
      ? patientQuery.replace(/^Patient\//, '')
      : req.user!.id;

    await checkPatientAccess(req, patientId, 'VIEW_OBSERVATIONS');

    const consents = await prisma.caregiverConsent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });

    const fhirConsents = consents.map(mapToFhirConsent);
    return res.json(createSearchsetBundle(fhirConsents, 'Consent'));
  } catch (err: any) {
    const status = (err as any).status || 403;
    return sendFhirError(res, status, 'security', err.message);
  }
});

/**
 * 13. AuditEvent Resource
 * GET /api/fhir/r4/AuditEvent
 */
fhirRouter.get('/AuditEvent', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: req.user!.isClinician ? {} : { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const events = logs.map(mapToFhirAuditEvent);
    return res.json(createSearchsetBundle(events, 'AuditEvent'));
  } catch (err: any) {
    return sendFhirError(res, 500, 'transient', err.message);
  }
});
