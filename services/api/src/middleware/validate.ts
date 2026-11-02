import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

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
        res.status(400).json({
          error: 'Input validation failed',
          details: issues.map((e) => ({
            field: Array.isArray(e.path) ? e.path.join('.') : String(e.path || ''),
            message: e.message,
          })),
        });
        return;
      }
      res.status(400).json({ error: 'Malformed request payload' });
    }
  };
}