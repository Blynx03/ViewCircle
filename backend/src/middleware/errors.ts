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
  if (process.env.NODE_ENV !== 'test') console.error('Unhandled request error', error);
  response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
