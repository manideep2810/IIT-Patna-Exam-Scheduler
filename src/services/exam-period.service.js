import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

function validateDate(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, 'INVALID_DATE', `${fieldName} must use the YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'INVALID_DATE', `${fieldName} must be a valid calendar date.`);
  }

  return value;
}

function toExamPeriod(row) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function createExamPeriod({ name, startDate, endDate, timezone }, createdBy) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError(400, 'INVALID_EXAM_PERIOD_NAME', 'Exam period name is required.');
  }

  const startDateValue = validateDate(startDate, 'startDate');
  const endDateValue = validateDate(endDate, 'endDate');

  if (endDateValue < startDateValue) {
    throw new AppError(400, 'INVALID_EXAM_PERIOD_DATES', 'endDate must be on or after startDate.');
  }

  if (timezone !== undefined && (typeof timezone !== 'string' || !timezone.trim())) {
    throw new AppError(400, 'INVALID_TIMEZONE', 'timezone must be a non-empty string.');
  }

  const result = await pool.query(
    `INSERT INTO exam_periods (name, start_date, end_date, timezone, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, start_date, end_date, timezone, is_active, created_by, created_at`,
    [name.trim(), startDateValue, endDateValue, timezone?.trim() ?? 'Asia/Kolkata', createdBy]
  );

  return toExamPeriod(result.rows[0]);
}

export async function listExamPeriods() {
  const result = await pool.query(
    `SELECT id, name, start_date, end_date, timezone, is_active, created_by, created_at
     FROM exam_periods
     ORDER BY start_date DESC, created_at DESC`
  );

  return result.rows.map(toExamPeriod);
}
