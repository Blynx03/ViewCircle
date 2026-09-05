import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import sessionsRouter from './routes/sessions.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errors.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser());
app.get('/api/health', (_request, response) => response.json({ success: true, data: { status: 'ok' } }));
app.use('/api/sessions', sessionsRouter);
app.use((_request, response) => response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } }));
app.use(errorHandler);
