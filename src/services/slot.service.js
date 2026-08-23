import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireExamPeriodId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_EXAM_PERIOD_ID', 'examPeriodId must be a valid UUID.');
  }
}

function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, 'INVALID_EXAM_DATE', 'Each exam date must use the YYYY-MM-DD format.');
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, 'INVALID_EXAM_DATE', `${value} is not a valid calendar date.`);
  }

  return value;
}

function toSlot(row) {
  return {
    id: row.id,
    examPeriodId: row.exam_period_id,
    examDate: row.exam_date instanceof Date ? row.exam_date.toISOString().slice(0, 10) : row.exam_date,
    session: row.session,
    startAt: row.start_at,
    endAt: row.end_at
  };
}

export async function createSlots(examPeriodId, examDates) {
  requireExamPeriodId(examPeriodId);

  if (!Array.isArray(examDates) || examDates.length === 0) {
    throw new AppError(400, 'EXAM_DATES_REQUIRED', 'Provide at least one exam date.');
  }

  const dates = [...new Set(examDates.map(validateDate))];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const periodResult = await client.query(
      `SELECT id,
              start_date::text AS start_date,
              end_date::text AS end_date,
              timezone
       FROM exam_periods
       WHERE id = $1
       FOR UPDATE`,
      [examPeriodId]
    );
    const period = periodResult.rows[0];

    if (!period) {
      throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
    }

    const datesOutsidePeriod = dates.filter((date) => date < period.start_date || date > period.end_date);

    if (datesOutsidePeriod.length > 0) {
      throw new AppError(
        400,
        'EXAM_DATE_OUTSIDE_PERIOD',
        `Exam dates must be inside the selected exam period: ${datesOutsidePeriod.join(', ')}.`
      );
    }

    const existingSlots = await client.query(
      `SELECT DISTINCT exam_date
       FROM exam_slots
       WHERE exam_period_id = $1 AND exam_date = ANY($2::date[])`,
      [examPeriodId, dates]
    );

    if (existingSlots.rowCount > 0) {
      throw new AppError(
        409,
        'SLOTS_ALREADY_EXIST',
        `Slots already exist for: ${existingSlots.rows.map((row) => row.exam_date).join(', ')}.`
      );
    }

    const createdSlots = await client.query(
      `WITH requested_dates AS (
         SELECT UNNEST($2::date[]) AS exam_date
       )
       INSERT INTO exam_slots (exam_period_id, exam_date, session, start_at, end_at)
       SELECT period.id,
              requested_dates.exam_date,
              sessions.session::slot_session,
              (requested_dates.exam_date + sessions.start_time) AT TIME ZONE period.timezone,
              (requested_dates.exam_date + sessions.end_time) AT TIME ZONE period.timezone
       FROM exam_periods period
       CROSS JOIN requested_dates
       CROSS JOIN (
         VALUES
           ('MORNING', TIME '09:30', TIME '12:30'),
           ('AFTERNOON', TIME '14:30', TIME '17:30')
       ) AS sessions(session, start_time, end_time)
       WHERE period.id = $1
       RETURNING id, exam_period_id, exam_date, session, start_at, end_at`,
      [examPeriodId, dates]
    );

    await client.query('COMMIT');
    return createdSlots.rows.map(toSlot);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listSlots(examPeriodId) {
  requireExamPeriodId(examPeriodId);

  const result = await pool.query(
    `SELECT slots.id, slots.exam_period_id, slots.exam_date, slots.session, slots.start_at, slots.end_at
     FROM exam_slots slots
     JOIN exam_periods periods ON periods.id = slots.exam_period_id
     WHERE slots.exam_period_id = $1
       AND slots.exam_date BETWEEN periods.start_date AND periods.end_date
     ORDER BY slots.exam_date ASC, slots.start_at ASC`,
    [examPeriodId]
  );

  return result.rows.map(toSlot);
}
