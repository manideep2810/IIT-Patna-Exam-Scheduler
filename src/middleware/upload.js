import multer from 'multer';

import { env } from '../config/env.js';

export const uploadSingleSpreadsheet = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadBytes,
    files: 1
  }
}).single('file');
