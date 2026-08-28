import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, label, code) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, code, `${label} must be a valid UUID.`);
  }
}

function escapeCsvValue(value) {
  let text = value === null || value === undefined ? '' : String(value);

  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

function formatCsv(rows) {
  const header = [
    'Exam Date',
    'Session',
    'Start Time',
    'End Time',
    'Course Code',
    'Course Name',
    'Candidate Count',
    'Room Number',
    'Location',
    'Seats Reserved',
    'Allocated Students'
  ];

  return [header, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\r\n') + '\r\n';
}

function safeFilenamePart(value) {
  return String(value).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'timetable';
}

async function requireExamPeriod(examPeriodId) {
  const result = await pool.query('SELECT id, name FROM exam_periods WHERE id = $1', [examPeriodId]);

  if (result.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }

  return result.rows[0];
}

async function listExportRows(examPeriodId, user) {
  const result = await pool.query(
    `WITH allocation_positions AS (
       SELECT allocations.exam_id,
              allocations.room_id,
              allocations.seats_reserved,
              COALESCE(
                SUM(allocations.seats_reserved) OVER (
                  PARTITION BY allocations.exam_id
                  ORDER BY allocations.seats_reserved DESC, rooms.room_number ASC, allocations.id ASC
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ),
                0
              )::integer AS students_before_room
       FROM exam_room_allocations allocations
       JOIN rooms ON rooms.id = allocations.room_id
     )
     SELECT slots.exam_date,
            slots.session,
            TO_CHAR(slots.start_at AT TIME ZONE periods.timezone, 'HH24:MI') AS start_time,
            TO_CHAR(slots.end_at AT TIME ZONE periods.timezone, 'HH24:MI') AS end_time,
            courses.course_code,
            courses.course_name,
            candidates.candidate_count,
            rooms.room_number,
            rooms.location,
            allocation_positions.seats_reserved,
            COALESCE(allocated_students.roll_numbers, '') AS allocated_students
     FROM exams
     JOIN exam_slots slots ON slots.id = exams.exam_slot_id
     JOIN exam_periods periods ON periods.id = exams.exam_period_id
     JOIN courses ON courses.id = exams.course_id
     JOIN allocation_positions ON allocation_positions.exam_id = exams.id
     JOIN rooms ON rooms.id = allocation_positions.room_id
     JOIN LATERAL (
       SELECT COUNT(*)::integer AS candidate_count
       FROM exam_candidates
       WHERE exam_id = exams.id
     ) candidates ON true
     LEFT JOIN LATERAL (
       SELECT STRING_AGG(enrolled.roll_number, '; ' ORDER BY enrolled.roll_number) AS roll_numbers
       FROM (
         SELECT students.roll_number
         FROM course_enrollments enrollments
         JOIN students ON students.id = enrollments.student_id
         WHERE enrollments.exam_period_id = exams.exam_period_id
           AND enrollments.course_id = exams.course_id
         ORDER BY students.roll_number ASC
         OFFSET allocation_positions.students_before_room
         LIMIT allocation_positions.seats_reserved
       ) enrolled
     ) allocated_students ON true
     WHERE exams.exam_period_id = $1
       AND exams.status = 'SCHEDULED'
       AND (
         $2 = 'SUPER_ADMIN'
         OR EXISTS (
           SELECT 1
           FROM admin_course_prefix_permissions permissions
           WHERE permissions.user_id = $3
             AND UPPER(courses.course_code) LIKE permissions.course_prefix || '%'
         )
       )
     ORDER BY slots.exam_date ASC, slots.start_at ASC, courses.course_code ASC,
              allocation_positions.seats_reserved DESC, rooms.room_number ASC`,
    [examPeriodId, user.role, user.id]
  );

  return result.rows.map((row) => [
    row.exam_date,
    row.session === 'MORNING' ? 'Morning' : 'Afternoon',
    row.start_time,
    row.end_time,
    row.course_code,
    row.course_name,
    row.candidate_count,
    row.room_number,
    row.location,
    row.seats_reserved,
    row.allocated_students
  ]);
}

export async function exportTimetableCsv(examPeriodId, user) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  const period = await requireExamPeriod(examPeriodId);
  const rows = await listExportRows(examPeriodId, user);

  return {
    filename: `${safeFilenamePart(period.name)}-timetable.csv`,
    csv: formatCsv(rows)
  };
}

export async function exportDepartmentAdminTimetableCsv(examPeriodId, departmentAdminId) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  requireUuid(departmentAdminId, 'departmentAdminId', 'INVALID_DEPARTMENT_ADMIN_ID');
  const [period, userResult] = await Promise.all([
    requireExamPeriod(examPeriodId),
    pool.query(
      `SELECT id, email, role, is_active
       FROM users
       WHERE id = $1 AND role = 'DEPARTMENT_ADMIN'`,
      [departmentAdminId]
    )
  ]);
  const departmentAdmin = userResult.rows[0];

  if (!departmentAdmin) {
    throw new AppError(404, 'DEPARTMENT_ADMIN_NOT_FOUND', 'The selected Department Admin was not found.');
  }

  if (!departmentAdmin.is_active) {
    throw new AppError(
      400,
      'DEPARTMENT_ADMIN_INACTIVE',
      'Activate the selected Department Admin before exporting their timetable.'
    );
  }

  const rows = await listExportRows(examPeriodId, departmentAdmin);

  return {
    filename: `${safeFilenamePart(period.name)}-${safeFilenamePart(departmentAdmin.email)}-timetable.csv`,
    csv: formatCsv(rows)
  };
}
