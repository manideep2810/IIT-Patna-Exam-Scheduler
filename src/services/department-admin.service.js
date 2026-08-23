import bcrypt from 'bcrypt';

import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';
import { BCRYPT_ROUNDS } from './auth.service.js';
import { normalizeEmail, toSafeUser, validatePassword } from './user.service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalDepartmentId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_DEPARTMENT_ID', 'departmentId must be a valid UUID.');
  }

  return value;
}

function userId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_USER_ID', 'userId must be a valid UUID.');
  }

  return value;
}

export async function createDepartmentAdmin({ email: emailInput, password, departmentId }) {
  const email = normalizeEmail(emailInput);
  validatePassword(password, 'Temporary password');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await pool.query(
    `INSERT INTO users (department_id, email, password_hash, role, must_change_password, is_active)
     VALUES ($1, $2, $3, 'DEPARTMENT_ADMIN', true, true)
     RETURNING id, department_id, email, role, must_change_password, is_active, created_at, updated_at`,
    [optionalDepartmentId(departmentId), email, passwordHash]
  );

  return toSafeUser(result.rows[0]);
}

export async function listDepartmentAdmins() {
  const result = await pool.query(
    `SELECT u.id, u.department_id, u.email, u.role, u.must_change_password, u.is_active,
            u.created_at, u.updated_at, d.code AS department_code
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.role = 'DEPARTMENT_ADMIN'
     ORDER BY u.email ASC`
  );

  return result.rows.map(toSafeUser);
}

export async function setDepartmentAdminPassword(idInput, password) {
  const id = userId(idInput);
  validatePassword(password, 'Temporary password');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         must_change_password = true,
         updated_at = now()
     WHERE id = $2 AND role = 'DEPARTMENT_ADMIN'
     RETURNING id, department_id, email, role, must_change_password, is_active, created_at, updated_at`,
    [passwordHash, id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'DEPARTMENT_ADMIN_NOT_FOUND', 'Department Admin was not found.');
  }

  return toSafeUser(result.rows[0]);
}

export async function setDepartmentAdminStatus(idInput, isActive) {
  const id = userId(idInput);

  if (typeof isActive !== 'boolean') {
    throw new AppError(400, 'INVALID_STATUS', 'isActive must be true or false.');
  }

  const result = await pool.query(
    `UPDATE users
     SET is_active = $1,
         updated_at = now()
     WHERE id = $2 AND role = 'DEPARTMENT_ADMIN'
     RETURNING id, department_id, email, role, must_change_password, is_active, created_at, updated_at`,
    [isActive, id]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'DEPARTMENT_ADMIN_NOT_FOUND', 'Department Admin was not found.');
  }

  return toSafeUser(result.rows[0]);
}
