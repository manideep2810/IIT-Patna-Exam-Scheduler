import dotenv from 'dotenv';

dotenv.config();

const requiredKeys = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN'];

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. Copy .env.example to .env and set a value.`);
  }
}

const parsedPort = Number.parseInt(process.env.PORT ?? '3000', 10);
const parsedMaxUploadSizeMb = Number.parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? '10', 10);

if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!Number.isInteger(parsedMaxUploadSizeMb) || parsedMaxUploadSizeMb < 1) {
  throw new Error('MAX_UPLOAD_SIZE_MB must be a positive integer.');
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

export const env = Object.freeze({
  port: parsedPort,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN,
  maxUploadBytes: parsedMaxUploadSizeMb * 1024 * 1024
});
