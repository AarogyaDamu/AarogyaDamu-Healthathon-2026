import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';

export class HealthcareApiError extends Error {
  statusCode: number;
  code: string;
  incidentId: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HealthcareApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.incidentId = randomUUID();
    this.details = details;
  }
}

export function healthcareErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const incidentId = err.incidentId || randomUUID();
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error.';
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');

  safeClinicalLog('error', `API Exception [${code}] (incident: ${incidentId}): ${message}`, {
    statusCode,
    code,
    incidentId,
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    incidentId,
    timestamp: new Date().toISOString(),
    ...(err.details ? { details: err.details } : {}),
  });
}

