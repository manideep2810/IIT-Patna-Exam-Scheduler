import { AppError } from '../middleware/error-handler.js';
import { pool } from '../db/pool.js';

export function normalizeEmail(value) {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_EMAIL', 'A valid email address is required.');
  }

  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'INVALID_EMAIL', 'A valid email address is required.');
  }

  return email;
}

export function validatePassword(value, fieldName = 'Password') {
  if (typeof value !== 'string' || value.length < 8) {
    throw new AppError(400, 'INVALID_PASSWORD', `${fieldName} must contain at least 8 characters.`);
  }
}

export function toSafeUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.must_change_password,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.department_id ? { departmentId: row.department_id } : {}),
    ...(row.department_code ? { departmentCode: row.department_code } : {})
  };
}

export async function findUserWithPasswordByEmail(email) {
  const result = await pool.query(
    `SELECT id, department_id, email, password_hash, role, must_change_password, is_active,
            created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id) {
  const result = await pool.query(
    `SELECT id, department_id, email, role, must_change_password, is_active, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}
