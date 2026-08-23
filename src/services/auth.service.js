import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from '../middleware/error-handler.js';
import {
  findUserWithPasswordByEmail,
  normalizeEmail,
  toSafeUser,
  validatePassword
} from './user.service.js';
import { pool } from '../db/pool.js';

const BCRYPT_ROUNDS = 12;

function invalidCredentialsError() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
}

export function signAccessToken(user) {
  return jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresIn
  });
}

export async function login(emailInput, password) {
  let email;

  try {
    email = normalizeEmail(emailInput);
  } catch {
    throw invalidCredentialsError();
  }

  if (typeof password !== 'string') {
    throw invalidCredentialsError();
  }

  const user = await findUserWithPasswordByEmail(email);

  if (!user || !user.is_active) {
    throw invalidCredentialsError();
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw invalidCredentialsError();
  }

  return {
    accessToken: signAccessToken(user),
    user: toSafeUser(user)
  };
}

export async function changePassword(userId, currentPassword, newPassword) {
  if (typeof currentPassword !== 'string') {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is required.');
  }

  validatePassword(newPassword, 'New password');

  const result = await pool.query(
    `SELECT id, password_hash
     FROM users
     WHERE id = $1`,
    [userId]
  );
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new AppError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = false,
         updated_at = now()
     WHERE id = $2
     RETURNING id, department_id, email, role, must_change_password, is_active, created_at, updated_at`,
    [passwordHash, userId]
  );

  return toSafeUser(updated.rows[0]);
}

export { BCRYPT_ROUNDS };
