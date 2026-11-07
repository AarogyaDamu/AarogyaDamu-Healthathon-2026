import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import crypto from 'crypto';

export function validateRequest(schema: {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.body) req.body = await schema.body.parseAsync(req.body);
      if (schema.params) req.params = await schema.params.parseAsync(req.params) as any;
      if (schema.query) req.query = await schema.query.parseAsync(req.query) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = (error.issues || (error as any).errors || []) as any[];
        const correlationId =
          (req.headers['x-request-id'] as string) ||
          (req.headers['x-correlation-id'] as string) ||
          crypto.randomUUID();

        // Safe developer diagnostic log (no passwords, API keys, tokens, or patient PII)
        console.warn(
          `[Validation Warning] ${req.method} ${req.originalUrl || req.url} | CorrelationId: ${correlationId} | Invalid fields:`,
          issues.map((i) => ({
            field: Array.isArray(i.path) ? i.path.join('.') : String(i.path || ''),
            code: i.code,
            message: i.message,
            expected: (i as any).expected,
            received: (i as any).received,
          }))
        );

        const summary = issues
          .map((i) => {
            const field = Array.isArray(i.path) ? i.path.join('.') : String(i.path || '');
            return field ? `${field}: ${i.message}` : i.message;
          })
          .join('; ');

        res.status(400).json({
          error: 'Input validation failed',
          message: `Input validation failed: ${summary || 'Invalid request payload'}`,
          correlationId,
          details: issues.map((e) => ({
            field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
            message: e.message,
            expected: (e as any).expected,
            received: (e as any).received,
          })),
        });
        return;
      }
      res.status(400).json({ error: 'Malformed request payload' });
    }
  };
}