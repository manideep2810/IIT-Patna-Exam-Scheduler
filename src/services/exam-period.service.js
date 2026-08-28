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

const DEFAULT_SESSION_TIMES = Object.freeze({
  morningStartTime: '09:30',
  morningEndTime: '12:30',
  afternoonStartTime: '14:30',
  afternoonEndTime: '17:30'
});

function validateTime(value, fieldName) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AppError(400, 'INVALID_SESSION_TIME', `${fieldName} must use 24-hour HH:MM format.`);
  }

  return value;
}

function formatTime(value) {
  return typeof value === 'string' ? value.slice(0, 5) : value;
}

function toExamPeriod(row) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    morningStartTime: formatTime(row.morning_start_time),
    morningEndTime: formatTime(row.morning_end_time),
    afternoonStartTime: formatTime(row.afternoon_start_time),
    afternoonEndTime: formatTime(row.afternoon_end_time),
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function createExamPeriod({
  name,
  startDate,
  endDate,
  timezone,
  morningStartTime,
  morningEndTime,
  afternoonStartTime,
  afternoonEndTime
}, createdBy) {
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

  const times = {
    morningStartTime: validateTime(morningStartTime ?? DEFAULT_SESSION_TIMES.morningStartTime, 'morningStartTime'),
    morningEndTime: validateTime(morningEndTime ?? DEFAULT_SESSION_TIMES.morningEndTime, 'morningEndTime'),
    afternoonStartTime: validateTime(afternoonStartTime ?? DEFAULT_SESSION_TIMES.afternoonStartTime, 'afternoonStartTime'),
    afternoonEndTime: validateTime(afternoonEndTime ?? DEFAULT_SESSION_TIMES.afternoonEndTime, 'afternoonEndTime')
  };

  if (times.morningEndTime <= times.morningStartTime || times.afternoonEndTime <= times.afternoonStartTime) {
    throw new AppError(400, 'INVALID_SESSION_TIME_RANGE', 'Each examination session must end after it starts.');
  }

  if (times.afternoonStartTime < times.morningEndTime) {
    throw new AppError(400, 'OVERLAPPING_EXAM_SESSIONS', 'The afternoon session must start at or after the morning session ends.');
  }

  const result = await pool.query(
    `INSERT INTO exam_periods (
       name, start_date, end_date, timezone,
       morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time,
       created_by
     )
     VALUES ($1, $2, $3, $4, $5::time, $6::time, $7::time, $8::time, $9)
     RETURNING id, name, start_date, end_date, timezone,
               morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time,
               is_active, created_by, created_at`,
    [
      name.trim(), startDateValue, endDateValue, timezone?.trim() ?? 'Asia/Kolkata',
      times.morningStartTime, times.morningEndTime, times.afternoonStartTime, times.afternoonEndTime,
      createdBy
    ]
  );

  return toExamPeriod(result.rows[0]);
}

export async function listExamPeriods() {
  const result = await pool.query(
    `SELECT id, name, start_date, end_date, timezone,
            morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time,
            is_active, created_by, created_at
     FROM exam_periods
     ORDER BY start_date DESC, created_at DESC`
  );

  return result.rows.map(toExamPeriod);
}
