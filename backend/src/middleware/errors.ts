import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ServiceError } from '../services/session-service.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Please check the information you entered.' } });
    return;
  }
  if (error instanceof ServiceError) {
    response.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  const bodyError = error as { type?: string } | null;
  if (bodyError?.type === 'entity.parse.failed' || bodyError?.type === 'entity.too.large') {
    response.status(bodyError.type === 'entity.too.large' ? 413 : 400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Please check the information you entered.' } });
    return;
  }
  // Parser/transport errors can carry raw bodies, credentials or push endpoints.
  if (process.env.NODE_ENV !== 'test') console.error('Unhandled request error');
  response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
