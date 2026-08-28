import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { env } from './config/env.js';
import healthRouter from './routes/health.js';
import scheduleRouter from './routes/schedule.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use('/health', healthRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/exam-periods', scheduleRouter);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;