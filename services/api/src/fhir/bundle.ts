/**
 * HL7 FHIR R4 Bundle Builder
 * Handles serialization of searchset, transaction, and patient $everything collections.
 */

import { FhirBundle, FhirResourceBase } from './types';

const FHIR_BASE_URL = process.env.FHIR_SERVER_URL || 'https://app.example.com/api/fhir/r4';

/**
 * Creates a searchset bundle for FHIR search operations
 */
export function createSearchsetBundle(
  resources: FhirResourceBase[],
  resourceType: string,
  total?: number,
  queryString: string = ''
): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    timestamp: new Date().toISOString(),
    total: total !== undefined ? total : resources.length,
    link: [
      {
        relation: 'self',
        url: `${FHIR_BASE_URL}/${resourceType}${queryString ? `?${queryString}` : ''}`,
      },
    ],
    entry: resources.map((r) => ({
      fullUrl: `${FHIR_BASE_URL}/${r.resourceType}/${r.id}`,
      resource: r,
      search: {
        mode: 'match',
      },
    })),
  };
}

/**
 * Creates a Patient $everything collection bundle
 */
export function createPatientRecordBundle(
  patientId: string,
  resources: FhirResourceBase[]
): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    id: `bundle-patient-${patientId}-everything`,
    timestamp: new Date().toISOString(),
    total: resources.length,
    link: [
      {
        relation: 'self',
        url: `${FHIR_BASE_URL}/Patient/${patientId}/$everything`,
      },
    ],
    entry: resources.map((r) => ({
      fullUrl: `${FHIR_BASE_URL}/${r.resourceType}/${r.id}`,
      resource: r,
    })),
  };
}

