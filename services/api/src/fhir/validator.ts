/**
 * HL7 FHIR R4 Resource Validator & OperationOutcome Generator
 * Enforces official FHIR R4 schema invariants, data types, and required elements.
 */

import { FhirResourceBase, FhirOperationOutcome } from './types';

export interface ValidationIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  diagnostics: string;
  location?: string[];
  expression?: string[];
}

/**
 * Creates an official FHIR OperationOutcome resource
 */
export function createOperationOutcome(issues: ValidationIssue[]): FhirOperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: issues.map((i) => ({
      severity: i.severity,
      code: i.code,
      diagnostics: i.diagnostics,
      location: i.location,
      expression: i.expression,
    })),
  };
}

/**
 * Validates any FHIR resource against core HL7 FHIR R4 constraints
 */
export function validateFhirResource(resource: any): { valid: boolean; outcome?: FhirOperationOutcome } {
  const issues: ValidationIssue[] = [];

  if (!resource || typeof resource !== 'object') {
    issues.push({
      severity: 'fatal',
      code: 'structure',
      diagnostics: 'Payload must be a non-null JSON object.',
    });
    return { valid: false, outcome: createOperationOutcome(issues) };
  }

  // 1. Mandatory resourceType
  if (!resource.resourceType || typeof resource.resourceType !== 'string') {
    issues.push({
      severity: 'error',
      code: 'required',
      diagnostics: 'Missing mandatory field "resourceType".',
      location: ['resourceType'],
    });
    return { valid: false, outcome: createOperationOutcome(issues) };
  }

  // 2. Resource-Specific Schema Validations
  switch (resource.resourceType) {
    case 'Patient': {
      if (!resource.id) {
        issues.push({
          severity: 'warning',
          code: 'invariant',
          diagnostics: 'Patient should contain a persistent resource id.',
          location: ['id'],
        });
      }
      break;
    }

    case 'Practitioner': {
      if (resource.name && !Array.isArray(resource.name)) {
        issues.push({
          severity: 'error',
          code: 'structure',
          diagnostics: 'Practitioner.name must be an array of HumanName.',
          location: ['name'],
        });
      }
      break;
    }

    case 'Observation': {
      // Must have status
      const validStatuses = ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'];
      if (!resource.status || !validStatuses.includes(resource.status)) {
        issues.push({
          severity: 'error',
          code: 'code-invalid',
          diagnostics: `Observation.status must be one of: ${validStatuses.join(', ')}.`,
          location: ['status'],
        });
      }

      // Must have code
      if (!resource.code || typeof resource.code !== 'object') {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Observation.code is required.',
          location: ['code'],
        });
      } else if (!resource.code.coding && !resource.code.text) {
        issues.push({
          severity: 'error',
          code: 'value',
          diagnostics: 'Observation.code must have at least one coding or text.',
          location: ['code.coding'],
        });
      }

      // Must have subject
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Observation.subject reference is required.',
          location: ['subject.reference'],
        });
      }

      // Quantity validations
      if (resource.valueQuantity) {
        if (typeof resource.valueQuantity.value !== 'number' || isNaN(resource.valueQuantity.value)) {
          issues.push({
            severity: 'error',
            code: 'value',
            diagnostics: 'Observation.valueQuantity.value must be a valid number.',
            location: ['valueQuantity.value'],
          });
        }
        if (resource.valueQuantity.system && resource.valueQuantity.system !== 'http://unitsofmeasure.org') {
          issues.push({
            severity: 'warning',
            code: 'code-invalid',
            diagnostics: 'Observation.valueQuantity.system should be official UCUM "http://unitsofmeasure.org".',
            location: ['valueQuantity.system'],
          });
        }
      }
      break;
    }

    case 'Condition': {
      if (!resource.code || typeof resource.code !== 'object') {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Condition.code is required.',
          location: ['code'],
        });
      }
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Condition.subject is required.',
          location: ['subject.reference'],
        });
      }
      break;
    }

    case 'CarePlan': {
      const validStatuses = ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'];
      if (!resource.status || !validStatuses.includes(resource.status)) {
        issues.push({
          severity: 'error',
          code: 'code-invalid',
          diagnostics: `CarePlan.status must be one of: ${validStatuses.join(', ')}.`,
          location: ['status'],
        });
      }
      const validIntents = ['proposal', 'plan', 'order', 'option'];
      if (!resource.intent || !validIntents.includes(resource.intent)) {
        issues.push({
          severity: 'error',
          code: 'code-invalid',
          diagnostics: `CarePlan.intent must be one of: ${validIntents.join(', ')}.`,
          location: ['intent'],
        });
      }
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'CarePlan.subject is required.',
          location: ['subject.reference'],
        });
      }
      break;
    }

    case 'Goal': {
      if (!resource.lifecycleStatus) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Goal.lifecycleStatus is required.',
          location: ['lifecycleStatus'],
        });
      }
      if (!resource.description) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Goal.description is required.',
          location: ['description'],
        });
      }
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Goal.subject is required.',
          location: ['subject.reference'],
        });
      }
      break;
    }

    case 'Task': {
      if (!resource.status) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Task.status is required.',
          location: ['status'],
        });
      }
      if (!resource.intent) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Task.intent is required.',
          location: ['intent'],
        });
      }
      break;
    }

    case 'MedicationRequest': {
      if (!resource.status) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'MedicationRequest.status is required.',
          location: ['status'],
        });
      }
      if (!resource.intent) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'MedicationRequest.intent is required.',
          location: ['intent'],
        });
      }
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'MedicationRequest.subject is required.',
          location: ['subject.reference'],
        });
      }
      break;
    }

    case 'Encounter': {
      if (!resource.status) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Encounter.status is required.',
          location: ['status'],
        });
      }
      if (!resource.class || !resource.class.code) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Encounter.class Coding is required.',
          location: ['class'],
        });
      }
      if (!resource.subject || !resource.subject.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Encounter.subject is required.',
          location: ['subject.reference'],
        });
      }
      break;
    }

    case 'Consent': {
      if (!resource.status) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Consent.status is required.',
          location: ['status'],
        });
      }
      if (!resource.scope) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Consent.scope is required.',
          location: ['scope'],
        });
      }
      if (!resource.patient || !resource.patient.reference) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'Consent.patient reference is required.',
          location: ['patient.reference'],
        });
      }
      break;
    }

    case 'AuditEvent': {
      if (!resource.type || !resource.type.code) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'AuditEvent.type is required.',
          location: ['type'],
        });
      }
      if (!resource.recorded) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'AuditEvent.recorded timestamp is required.',
          location: ['recorded'],
        });
      }
      if (!resource.agent || !Array.isArray(resource.agent) || resource.agent.length === 0) {
        issues.push({
          severity: 'error',
          code: 'required',
          diagnostics: 'AuditEvent must have at least one agent.',
          location: ['agent'],
        });
      }
      break;
    }
  }

  const errors = issues.filter((i) => i.severity === 'fatal' || i.severity === 'error');
  if (errors.length > 0) {
    return { valid: false, outcome: createOperationOutcome(issues) };
  }

  return { valid: true, outcome: issues.length > 0 ? createOperationOutcome(issues) : undefined };
}

