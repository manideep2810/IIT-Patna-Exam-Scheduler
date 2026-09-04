import { pool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 100;

async function withTransaction(work) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function requireUuid(value, label, code) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(400, code, `${label} must be a valid UUID.`);
  }
}

function parsePagination({ page, pageSize } = {}) {
  const parsedPage = Number.parseInt(page ?? '1', 10);
  const parsedPageSize = Number.parseInt(pageSize ?? '10', 10);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    throw new AppError(400, 'INVALID_PAGE', 'page must be a positive integer.');
  }

  if (!Number.isInteger(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > MAX_PAGE_SIZE) {
    throw new AppError(400, 'INVALID_PAGE_SIZE', `pageSize must be between 1 and ${MAX_PAGE_SIZE}.`);
  }

  return { page: parsedPage, pageSize: parsedPageSize, offset: (parsedPage - 1) * parsedPageSize };
}

function normalizedSearch(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function paginationResponse(rows, total, pagination) {
  return {
    rows,
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.pageSize))
    }
  };
}

export async function listRoomsForImportData(query) {
  const pagination = parsePagination(query);
  const search = normalizedSearch(query.search);
  const location = normalizedSearch(query.location);
  const values = [search, location, pagination.pageSize, pagination.offset];
  const filter = `WHERE ($1 = '' OR rooms.room_number ILIKE '%' || $1 || '%' OR rooms.location ILIKE '%' || $1 || '%')
                    AND ($2 = '' OR rooms.location = $2)`;
  const [rowsResult, totalResult, locationsResult] = await Promise.all([
    pool.query(
      `SELECT rooms.id, rooms.room_number, rooms.location, rooms.exam_capacity, rooms.is_active
       FROM rooms
       ${filter}
       ORDER BY rooms.location ASC, rooms.room_number ASC
       LIMIT $3 OFFSET $4`,
      values
    ),
    pool.query(`SELECT COUNT(*)::integer AS total FROM rooms ${filter}`, values.slice(0, 2)),
    pool.query(`SELECT DISTINCT location FROM rooms WHERE location IS NOT NULL ORDER BY location ASC`)
  ]);

  return {
    ...paginationResponse(rowsResult.rows.map((row) => ({
      id: row.id,
      roomNumber: row.room_number,
      location: row.location,
      examCapacity: row.exam_capacity,
      isActive: row.is_active
    })), totalResult.rows[0].total, pagination),
    filters: { locations: locationsResult.rows.map((row) => row.location) }
  };
}

export async function listDepartmentPrefixPermissions(query) {
  const pagination = parsePagination(query);
  const search = normalizedSearch(query.search);
  const status = ['active', 'inactive'].includes(query.status) ? query.status : '';
  const showWithoutPrefixes = query.showWithoutPrefixes === 'true';
  const values = [search, status, showWithoutPrefixes, pagination.pageSize, pagination.offset];
  const userFilter = `WHERE users.role = 'DEPARTMENT_ADMIN'
                        AND ($1 = '' OR users.email ILIKE '%' || $1 || '%' OR EXISTS (
                          SELECT 1 FROM admin_course_prefix_permissions permissions
                          WHERE permissions.user_id = users.id
                            AND permissions.course_prefix ILIKE '%' || $1 || '%'
                        ))
                        AND ($2 = '' OR ($2 = 'active' AND users.is_active) OR ($2 = 'inactive' AND NOT users.is_active))
                        AND ($3 OR EXISTS (
                          SELECT 1 FROM admin_course_prefix_permissions permissions
                          WHERE permissions.user_id = users.id
                        ))`;
  const [rowsResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT users.id, users.email, users.is_active,
              COALESCE(ARRAY_AGG(permissions.course_prefix ORDER BY permissions.course_prefix)
                FILTER (WHERE permissions.id IS NOT NULL), '{}') AS course_prefixes
       FROM users
       LEFT JOIN admin_course_prefix_permissions permissions ON permissions.user_id = users.id
       ${userFilter}
       GROUP BY users.id, users.email, users.is_active
       ORDER BY users.email ASC
       LIMIT $4 OFFSET $5`,
      values
    ),
    pool.query(`SELECT COUNT(*)::integer AS total FROM users ${userFilter}`, values.slice(0, 3))
  ]);

  return paginationResponse(rowsResult.rows.map((row) => ({
    id: row.id,
    email: row.email,
    isActive: row.is_active,
    coursePrefixes: row.course_prefixes
  })), totalResult.rows[0].total, pagination);
}

export async function listCourseEnrollmentSummaries(examPeriodId, query) {
  if (typeof examPeriodId !== 'string' || !UUID_PATTERN.test(examPeriodId)) {
    throw new AppError(400, 'INVALID_EXAM_PERIOD_ID', 'examPeriodId must be a valid UUID.');
  }

  const pagination = parsePagination(query);
  const search = normalizedSearch(query.search);
  const period = await pool.query('SELECT id FROM exam_periods WHERE id = $1', [examPeriodId]);

  if (period.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }

  const filter = `WHERE enrollments.exam_period_id = $1
                    AND ($2 = '' OR courses.course_code ILIKE '%' || $2 || '%' OR courses.course_name ILIKE '%' || $2 || '%')`;
  const [rowsResult, totalResult] = await Promise.all([
    pool.query(
      `SELECT courses.id, courses.course_code, courses.course_name, COUNT(enrollments.student_id)::integer AS candidate_count
       FROM course_enrollments enrollments
       JOIN courses ON courses.id = enrollments.course_id
       ${filter}
       GROUP BY courses.id, courses.course_code, courses.course_name
       ORDER BY courses.course_code ASC
       LIMIT $3 OFFSET $4`,
      [examPeriodId, search, pagination.pageSize, pagination.offset]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT enrollments.course_id)::integer AS total
       FROM course_enrollments enrollments
       JOIN courses ON courses.id = enrollments.course_id
       ${filter}`,
      [examPeriodId, search]
    )
  ]);

  return paginationResponse(rowsResult.rows.map((row) => ({
    id: row.id,
    courseCode: row.course_code,
    courseName: row.course_name,
    candidateCount: row.candidate_count
  })), totalResult.rows[0].total, pagination);
}

export async function deleteRoomImportData(roomId) {
  requireUuid(roomId, 'roomId', 'INVALID_ROOM_ID');

  return withTransaction(async (client) => {
    const roomResult = await client.query(
      `SELECT id, room_number
       FROM rooms
       WHERE id = $1
       FOR UPDATE`,
      [roomId]
    );
    const room = roomResult.rows[0];

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'The selected room was not found.');
    }

    const allocationResult = await client.query(
      `SELECT 1
       FROM exam_room_allocations
       WHERE room_id = $1
       LIMIT 1`,
      [roomId]
    );

    if (allocationResult.rowCount > 0) {
      throw new AppError(
        409,
        'ROOM_IN_USE',
        `Room ${room.room_number} cannot be deleted because it is allocated to an examination. Delete that examination first.`
      );
    }

    await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    return { roomNumber: room.room_number };
  });
}

export async function deleteAllRoomsImportData() {
  return withTransaction(async (client) => {
    // Lock the room set before checking allocations so a concurrent scheduling
    // request cannot reserve a room between this check and the deletion.
    await client.query('SELECT id FROM rooms FOR UPDATE');
    const allocatedRooms = await client.query(
      `SELECT DISTINCT rooms.room_number
       FROM rooms
       JOIN exam_room_allocations allocations ON allocations.room_id = rooms.id
       ORDER BY rooms.room_number ASC`
    );

    if (allocatedRooms.rowCount > 0) {
      const roomNumbers = allocatedRooms.rows.map((row) => row.room_number);
      const shown = roomNumbers.slice(0, 8).join(', ');
      const suffix = roomNumbers.length > 8 ? ` and ${roomNumbers.length - 8} more` : '';
      throw new AppError(
        409,
        'ROOMS_IN_USE',
        `Imported rooms cannot be deleted while they are allocated to examinations: ${shown}${suffix}. Delete those examinations first.`,
        { roomNumbers }
      );
    }

    const deleted = await client.query('DELETE FROM rooms RETURNING id');
    return { deletedCount: deleted.rowCount };
  });
}

async function requirePeriod(client, examPeriodId) {
  requireUuid(examPeriodId, 'examPeriodId', 'INVALID_EXAM_PERIOD_ID');
  const period = await client.query('SELECT id FROM exam_periods WHERE id = $1 FOR UPDATE', [examPeriodId]);

  if (period.rowCount === 0) {
    throw new AppError(404, 'EXAM_PERIOD_NOT_FOUND', 'The selected exam period was not found.');
  }
}

async function assertCourseIsNotScheduled(client, examPeriodId, courseId) {
  const scheduled = await client.query(
    `SELECT courses.course_code
     FROM exams
     JOIN courses ON courses.id = exams.course_id
     WHERE exams.exam_period_id = $1
       AND exams.course_id = $2
       AND exams.status = 'SCHEDULED'
     LIMIT 1`,
    [examPeriodId, courseId]
  );

  if (scheduled.rowCount > 0) {
    throw new AppError(
      409,
      'ENROLLMENTS_LOCKED_BY_SCHEDULED_EXAM',
      `Enrollment data for ${scheduled.rows[0].course_code} cannot be deleted because its examination is already scheduled.`
    );
  }
}

export async function deleteCourseEnrollmentImportData(examPeriodId, courseId) {
  requireUuid(courseId, 'courseId', 'INVALID_COURSE_ID');

  return withTransaction(async (client) => {
    await requirePeriod(client, examPeriodId);
    await assertCourseIsNotScheduled(client, examPeriodId, courseId);
    const deleted = await client.query(
      `DELETE FROM course_enrollments
       WHERE exam_period_id = $1 AND course_id = $2
       RETURNING id`,
      [examPeriodId, courseId]
    );

    if (deleted.rowCount === 0) {
      throw new AppError(404, 'COURSE_ENROLLMENT_NOT_FOUND', 'No imported enrolments were found for the selected course.');
    }

    return { deletedCount: deleted.rowCount };
  });
}

export async function deleteAllCourseEnrollmentImportData(examPeriodId) {
  return withTransaction(async (client) => {
    await requirePeriod(client, examPeriodId);
    const scheduled = await client.query(
      `SELECT courses.course_code
       FROM exams
       JOIN courses ON courses.id = exams.course_id
       WHERE exams.exam_period_id = $1
         AND exams.status = 'SCHEDULED'
       ORDER BY courses.course_code ASC`,
      [examPeriodId]
    );

    if (scheduled.rowCount > 0) {
      const codes = scheduled.rows.map((row) => row.course_code);
      const shown = codes.slice(0, 8).join(', ');
      const suffix = codes.length > 8 ? ` and ${codes.length - 8} more` : '';
      throw new AppError(
        409,
        'ENROLLMENTS_LOCKED_BY_SCHEDULED_EXAM',
        `Enrollment data cannot be deleted while scheduled examinations exist for: ${shown}${suffix}. Delete those examinations first.`,
        { courseCodes: codes }
      );
    }

    const deleted = await client.query(
      'DELETE FROM course_enrollments WHERE exam_period_id = $1 RETURNING id',
      [examPeriodId]
    );
    return { deletedCount: deleted.rowCount };
  });
}
